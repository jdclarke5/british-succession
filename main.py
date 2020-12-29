'''Main script to make succession dataframe and plot.'''

import argparse
from datetime import datetime, timedelta
from dateutil.parser import parse as parse_date
import json
import pandas as pd
import logging
import yaml

logging.basicConfig(format='%(levelname)s: %(message)s', level=logging.DEBUG)

# Perth agreement dates
PERTH_SIGNED = '2011-10-28'
PERTH_EFFECTED = '2015-03-26'

def set_illegitimate(df, key, value, date=None):
    try:
        cond = (df[key] == value)
    except KeyError:
        return
    if sum(cond) > 0:
        filtered = df[cond]
        for index, row in filtered.iterrows():
            illegitimate_date = date or row['birth_date']
            df.loc[index, 'illegitimate_date'] = illegitimate_date
            logging.debug(f'Marked {row["short_name"]} illegitimate '
                f'from {illegitimate_date}')

def fill_succession(df, successors, parent_row):
    children = df.reindex(parent_row['children_ids'])
    # Sort children by absolute primogeniture
    children = children[children['external_url'].notnull()].sort_values('birth_date')
    # Handling for Perth agreement for children born after 2011-10-28 and
    # coming into effect on 2015-03-26.
    pre_perth = (children['birth_date'] <= PERTH_SIGNED)
    post_perth = (children['birth_date'] >= PERTH_EFFECTED)
    if pre_perth.all():
        # Male primogeniture
        children = children.sort_values('gender', ascending=False)
    elif post_perth.all():
        pass
    else:
        # Find index of non pre-perth absolute primogeniture youngest male
        keep_to = 0
        for i, (_, row) in enumerate(children[~pre_perth & ~post_perth].iterrows()):
            if row['gender'] == 'male':
                keep_to = i + 1
        children = pd.concat([
            # Pre-perth children
            children[pre_perth].sort_values('gender', ascending=False),
            # Non pre-Perth absolute primogeniture down to youngest male
            children[~pre_perth & ~post_perth][:keep_to],
            # Females in birth order
            children[~pre_perth & ~post_perth & (children['gender'] == 'female')],
            # Post-perth children
            children[post_perth],
        ])
        # Mark duplicate (females) as having (il)legitimate at effected date
        children.loc[children.index.duplicated(keep='last'), 
            'legitimate_date'] = PERTH_EFFECTED
        children.loc[children.index.duplicated(keep='first'), 
            'illegitimate_date'] = PERTH_EFFECTED
    # Set succession as parent succession and iterate over children in order
    succession = parent_row['succession']
    for index, child_row in children.iterrows():
        succession += 1
        illegitimate_date = parent_row['illegitimate_date'] \
            or child_row['illegitimate_date']
        row = {**child_row, 'succession': succession, 
            'illegitimate_date': illegitimate_date, '_id': index}
        successors.append(row)
        logging.debug(f'Filled successor #{succession}')
        succession = fill_succession(df, successors, row)
    return succession

def get_succession(successors_df, date):
    _df = successors_df
    born = (_df['birth_date'] <= date)
    alive = _df['death_date'].isnull() | (_df['death_date'] > date)
    legitimate = _df['legitimate_date'].isnull() | (_df['legitimate_date'] <= date)
    not_illegitimate = ~(_df['illegitimate_date'] <= date)
    succession = _df[(born & alive & legitimate & not_illegitimate)].copy()
    succession = succession.drop_duplicates('_id', keep='first')
    succession['succession'] = list(range(len(succession)))
    succession = succession.set_index('_id')
    return succession

def main():
    
    # Define and parse arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('--descendants', type=str, default='geni.yml',
        help='YAML file for descendants.')
    parser.add_argument('--seed', type=str, 
        default='0557aac6-264c-5a83-8f1e-a3f6cfac8b9a',
        help='Seed ancestor (Sophia of Hanover).')
    args = parser.parse_args()

    # Load the descendants
    logging.info('Loading descendants...')
    with open(args.descendants, 'r') as f:
        rows = yaml.safe_load(f)
    # Store in dataframe
    df = pd.DataFrame(rows).set_index('_id')

    # Load in the illegitimates
    logging.info('Loading illegitimates...')
    with open('illegitimates.yml', 'r') as f:
        illegitimates = yaml.safe_load(f)
    # Define the illegitimate column
    df['illegitimate_date'] = None
    # Set illegitimates according to rules in the file
    for illegitimate in illegitimates:
        date = illegitimate.get('date')
        for key, value in illegitimate['match'].items():
            set_illegitimate(df, key, value, date)
    # Log how many illegitimates
    illegitimate_total = sum(df['illegitimate_date'].notnull())
    logging.info(f'Marked {illegitimate_total} illegitimate.')

    # Do some cleaning
    logging.info(f'Cleaning total of {len(df)} descendants...')
    # Delete null birth dates
    cond = df['birth_date'].isnull()
    logging.info(f'Deleting {sum(cond)} descendants without birth date...')
    df = df[~cond]
    # Delete null death dates
    cond = df['death_date'].isnull() & ~df['is_alive'].isnull() \
        & (df['is_alive'] == False)
    logging.info(f'Deleting {sum(cond)} dead descendants without death date...')
    df = df[~cond]
    # Delete anyone with birth later than death
    cond = df['death_date'].notnull() & (df['death_date'] < df['birth_date'])
    logging.info(f'Deleting {sum(cond)} impossible birth/death dates...')
    df = df[~cond]
    # All done
    total = len(df)
    logging.info(f'Done cleaning! Total of {total} descendants remain')

    # Determine unfiltered order of succession
    # NOTE: There are duplicates if there are multiple possible lines 
    # of succession, and due to Perth agreement.
    df['legitimate_date'] = None
    logging.info('Determining unfiltered succession...')
    successors = [{'_id': args.seed, **df.loc[args.seed].to_dict(), 
        'succession': 0}]
    fill_succession(df, successors, successors[0])
    successors_df = pd.DataFrame(successors).sort_values('succession')
    successors_df = successors_df.drop_duplicates(
        ['_id', 'illegitimate_date'], keep='first')
    logging.info('Done!')

    # Output to files
    logging.info('Outputting to files...')
    _df = successors_df.set_index('_id')[['name', 'birth_date', 'death_date', 
        'illegitimate_date', 'legitimate_date', 'external_url']].copy()
    _df.to_csv('successors.csv')
    _df['_id'] = _df.index
    records = [{k: v for k, v in record.items() if v is not None}
        for record in _df.to_dict(orient='records')]
    with open('successors.json', 'w+') as f:
        json.dump({'last_updated': datetime.utcnow().isoformat(), 
            'successors': records}, f)

    # Print an example
    logging.info('Succession at 2020-01-01 is: '
        f'{get_succession(successors_df, "2020-01-01")}')

if __name__ == '__main__':
    main()
