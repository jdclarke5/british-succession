'''Data gatherer for Geni. Gathers the descendants of the seed profile 
(including descendants of brothers/sisters).
'''

import argparse
from datetime import date
from functools import wraps
import logging
import queue
import requests
import threading
import time
from tinydb import TinyDB
from tinydb.table import Document
from tinydb.middlewares import CachingMiddleware
from tinydb.storages import MemoryStorage, JSONStorage
from uuid import NAMESPACE_X500, uuid5
import yaml

logging.basicConfig(format='%(levelname)s: %(message)s', level=logging.DEBUG)

# Base Geni API url
BASE = 'https://www.geni.com/api'
# The default (public) rate limit (10 per 10s) does not seem to improve 
# with an app token, so we don't bother authorising. Set the rate to 9 per 11s
# to give some wiggle room.
RATE_LIMIT = 9
RATE_WINDOW = 11
# Maximum number of IDs per request.
# This appears to be 50 for basic accounts before pagination occurs.
# This can be set lower to increase parallelisation ability.
MAX_IDS = 40
# Fields to request
PROFILE_FIELDS = ','.join([
    'id', 'guid', # id
    'created_at', 'updated_at', 'public', 'deleted', 'locked', # meta
    'url', 'profile_url', # links
    'display_name', 'first_name', 'middle_name', 'last_name', 'maiden_name', 
    'name', 'names', 'nicknames', 'suffix', # name
    'gender', # gender
    'birth', 'birth_order', # birth
    'death', 'is_alive', 'living', # death
    'unions', # relations
])
UNION_FIELDS = ','.join([
    'id', # id
    'partners', # partners (parents if children)
    'children', # includes adopted and foster children
    'adopted_children', 'foster_children', # subsets of children
])

class RateLimiter(object):
    '''Thread-safe rate limiter.
    '''
    def __init__(self, limit, window):
        '''Ensures that there is no window period where there is more than 
        limit calls.
        '''
        self.limit = limit
        self.window = window
        self._timestamps = []
        self._lock = threading.Lock()

    def __call__(self, func):
        '''Decorator.
        '''
        @wraps(func)
        def wrapper(*args, **kwargs):
            with self._lock:
                now = time.time()
                # Keep the timestamps still within window
                self._timestamps = [t for t in self._timestamps 
                    if (now - t) < self.window]
                # If we are at the limit, then wait
                if len(self._timestamps) == self.limit:
                    earliest_timestamp = self._timestamps[0]
                    wait = earliest_timestamp + self.window - now
                    logging.info(f'Waiting {wait:.2f} seconds for rate limit')
                    time.sleep(wait)
                # Append the timestamp right before running the func
                _timestamp = time.time()
                self._timestamps.append(_timestamp)
            return func(*args, **kwargs)
        return wrapper

@RateLimiter(limit=RATE_LIMIT, window=RATE_WINDOW)
def request(session, endpoint):
    '''Make a rate-limited request to the Geni API.
    '''
    return session.get(endpoint)

def handle_profile(response, profiles, unions, lock):
    '''Handle profile response.
    '''
    results = response.get('results') or [response]
    get_union_ids = []
    for result in results:
        if not result.get('id'):
            logging.warning(f'Skipping result with no ID: {result}')
            continue
        # Split id from geni id
        doc_id = int(result['id'].split('-')[1])
        document = Document(result, doc_id=doc_id)
        name = result.get('name')
        with lock:
            # If the profile is already in the database then end here
            if profiles.contains(doc_id=doc_id):
                logging.debug(f'Profile {name} already present!')
                continue
            # Store it in the database
            profiles.insert(document)
            logging.info(f'Added profile #{profiles.__len__()}: {name}')
        # Construct query to unseen unions
        for u in result.get('unions', []):
            geni_id = u.split('/')[-1]
            doc_id = int(geni_id.split('-')[1])
            with lock:
                present = unions.contains(doc_id=doc_id)
            if not present:
                get_union_ids.append(geni_id)
    # Split into batches
    for i in range(0, len(get_union_ids), MAX_IDS):
        ids = get_union_ids[i:i+MAX_IDS]
        yield f'{BASE}/union?ids={",".join(ids)}&fields={UNION_FIELDS}'

def handle_union(response, profiles, unions, lock):
    '''Handle union response.
    '''
    results = response.get('results') or [response]
    get_child_ids = []
    for result in results:
        doc_id = int(result['id'].split('-')[1])
        document = Document(result, doc_id=doc_id)
        with lock:
            # If the union is already in the database then end here
            if unions.contains(doc_id=doc_id):
                logging.debug(f'Union {doc_id} already present!')
                continue
            # Store it in the database
            unions.insert(document)
            logging.info(f'Added union #{unions.__len__()}')
        # Construct query to unseen children profiles. These will either be 
        # the brothers/sisters or the children of the originating profile.
        for c in result.get('children', []):
            geni_id = c.split('/')[-1]
            doc_id = int(geni_id.split('-')[1])
            with lock:
                present = profiles.contains(doc_id=doc_id)
            if not present:
                get_child_ids.append(geni_id)
    # Split into batches
    for i in range(0, len(get_child_ids), MAX_IDS):
        ids = get_child_ids[i:i+MAX_IDS]
        yield f'{BASE}/profile?ids={",".join(ids)}&fields={PROFILE_FIELDS}'

def worker(q, session, profiles, unions, lock):
    '''Worker thread which takes work from the queue makes a single request
    to the Geni API.
    '''
    while True:
        # Grab from the queue TODO
        logging.debug(f'Queue length is: {q.qsize()}')
        endpoint = q.get()
        logging.info(f'Requesting endpoint: {endpoint}')
        r = request(session, endpoint)
        # Handle failures
        try:
            r.raise_for_status()
        except requests.exceptions.HTTPError as err:
            logging.warning(f'Request to {endpoint} failed with error "{err}"; '
                'Returning task to the queue...')
            q.put(endpoint)
            q.task_done()
        response = r.json()
        if '/profile' in endpoint:
            for endpoint in handle_profile(response, profiles, unions, lock):
                q.put(endpoint)
        else:
            for endpoint in handle_union(response, profiles, unions, lock):
                q.put(endpoint)
        q.task_done()

def geni_id_to_uuid(geni_id):
    return str(uuid5(NAMESPACE_X500, str(geni_id)))

def parse_date(struct):
    '''Parse date struct and return date and date accuracy.
    '''
    try:
        if not struct.get('year'):
            return None, None
        elif not struct.get('month'):
            return date(struct['year'], 1, 1), 'year'
        elif not struct.get('day'):
            return date(struct['year'], struct['month'], 1), 'month'
        else:
            return date(struct['year'], struct['month'], struct['day']), 'day'
    except:
        logging.warning(f'Could not parse date: {struct}')
        return None, None

def profile_to_row(profile, parent_profile=None):
    _geni_id = profile['id']
    _uuid = geni_id_to_uuid(_geni_id)
    name = profile.get('name')
    _birth_date = profile.get('birth', {}).get('date', {})
    _death_date = profile.get('death', {}).get('date', {})
    birth_date, birth_accuracy = parse_date(_birth_date)
    death_date, death_accuracy = parse_date(_death_date)
    return {
        '_id': _uuid,
        'name': name,
        'short_name': profile.get('display_name', name),
        'gender': profile.get('gender'),
        'birth_date': birth_date and birth_date.isoformat(),
        'birth_accuracy': birth_accuracy,
        'death_date': death_date and death_date.isoformat(),
        'death_accuracy': death_accuracy,
        'is_alive': profile.get('is_alive'),
        'has_children': False, # False unless proven otherwise
        'parent_ids': [geni_id_to_uuid(parent_profile['id'])] \
            if parent_profile else [],
        '_geni_id': _geni_id,
        '_geni_link': profile.get('profile_url'),
        '_geni_is_public': profile.get('public'),
        '_geni_deleted': profile.get('deleted'),
    }

def db_to_rows(profiles, unions):
    '''Take the Geni (local) database and translate it into the simplified row 
    format expected by the main script.
    '''
    rows = []
    len_profiles = len(profiles)
    for i, profile in enumerate(profiles):
        # Log progress
        if not (i+1) % 100:
            logging.info(f'Processing {i+1}/{len_profiles}')
        # Skip private profiles
        if not profile.get('public'):
            continue
        # Get id information
        _geni_id = profile['id']
        _geni_url = profile['url']
        _id = geni_id_to_uuid(_geni_id)
        name = profile.get('name')
        # Determine birth/death dates
        _birth_date = profile.get('birth', {}).get('date', {})
        _death_date = profile.get('death', {}).get('date', {})
        birth_date, birth_accuracy = parse_date(_birth_date)
        death_date, death_accuracy = parse_date(_death_date)
        # Find children and parents through unions.
        # NOTE: The ids of children/parents may not be present in rows.
        children_ids = []
        parent_ids = []
        for geni_union_url in profile.get('unions', []):
            _doc_id = int(geni_union_url.split('-')[1])
            union = unions.get(doc_id=_doc_id)
            # If a partner in the union, get children
            if _geni_url in union.get('partners', []):
                for child_url in union.get('children', []):
                    is_adopted = child_url in union.get('adopted_children', [])
                    is_foster = child_url in union.get('foster_children', [])
                    if is_adopted or is_foster:
                        continue
                    child_id = child_url.split('/')[-1]
                    children_ids.append(geni_id_to_uuid(child_id))
            # If a child in the union, get parents
            elif _geni_url in union.get('children', []):
                is_adopted = _geni_url in union.get('adopted_children', [])
                is_foster = _geni_url in union.get('foster_children', [])
                if is_adopted or is_foster:
                    continue
                for partner_url in union.get('partners', []):
                    partner_id = partner_url.split('/')[-1]
                    parent_ids.append(geni_id_to_uuid(partner_id))
        row = {
            '_id': _id,
            'name': name,
            'short_name': profile.get('display_name', name),
            'gender': profile.get('gender'),
            'birth_date': birth_date and birth_date.isoformat(),
            'birth_accuracy': birth_accuracy,
            'death_date': death_date and death_date.isoformat(),
            'death_accuracy': death_accuracy,
            'is_alive': profile.get('is_alive'),
            'children_ids': children_ids,
            'parent_ids': parent_ids,
            'external_url': profile.get('profile_url'),
            '_geni_id': _geni_id,
        }
        rows.append(row)
    return rows

def main(args):
    # Instance the local database
    storage = CachingMiddleware(JSONStorage)
    db = TinyDB(args.db, storage=storage, sort_keys=True, indent=2)
    # db = TinyDB(storage=MemoryStorage)
    profiles = db.table('profiles')
    unions = db.table('unions')
    lock = threading.Lock()
    # Instance a shared requests session to improve efficiency
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(
        pool_connections=args.workers, pool_maxsize=args.workers)
    session.mount('https://', adapter)
    # Instance the task queue
    q = queue.Queue()
    # Start the workers
    for _ in range(args.workers):
        _args = (q, session, profiles, unions, lock)
        threading.Thread(target=worker, args=_args, daemon=True).start()
    # Start the work and wait until queue is empty
    endpoint = f'{BASE}/profile?ids={args.seed}'
    q.put(endpoint)
    # Wait until all tasks off queue
    q.join()
    # Flush the database cache to storage
    db.storage.flush()
    db.close()
    logging.info('Geni requests done!')
    # Now do the conversion
    logging.info('Processing database into simplified row format...')
    rows = db_to_rows(profiles, unions)
    logging.info(f'Dumping {len(rows)} rows to file...')
    with open('geni.yml', 'w+') as f:
        yaml.dump(rows, f, indent=2, sort_keys=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--seed', type=str, default='profile-56847813',
        help='Seed for finding descendants (default is Sophia of Hanover.')
    parser.add_argument('--workers', type=int, default=1, 
        help='Number of workers to make threaded requests.')
    parser.add_argument('--db', type=str, default='db.json',
        help='Local database of raw Geni responses.')
    args = parser.parse_args()
    main(args)
