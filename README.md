# British Royal Line of Succession

Welcome to the home page for the British Succession project!

## Aim and Scope

The aim of this project is to track the timeline of the line of succession to the British Throne through automated (programmatic) means. The current scope is to track all descendants of the [Electress Sophia of Hanover](https://en.wikipedia.org/wiki/Sophia_of_Hanover). These descendants, after the [Act of Settlement 1701](https://en.wikipedia.org/wiki/Act_of_Settlement_1701), are the rightful heirs to the throne. The existing monarch and line of succession is therefore applicable from the reign of George I (1 August 1714).

## Licensing

The code for this project is (and always will be) open source and licensed under GPLv3.

## Implementation Notes

Please do not raise issues with this project without acknowledging the following limitations/caveats.

- *This is not a genealogy project!* We rely on well-established external sources for ancestry/descendant data. There are no plans to begin curating our own data of this kind. Therefore the accuracy of this project is entirely dependent on the accuracy of such public sources. 
  - Inaccuracies in these data sources should be reported/contributed to the curators of those data sources, not here.
  - We do however curate a [list of illegitimate persons](illegitimates.yml) (and dates); contributions to this list are welcome.
- The change from male to absolute primogeniture preference due to the [Perth Agreement](https://en.wikipedia.org/wiki/Perth_Agreement) (for persons born after 28 October 2011 and effective 26 March 2015) *is* taken into account.
- No attempt has yet been made to tag Roman Catholic persons as illegitimate to the line of succession. This could be made to fit within the existing framework with minor amendments. Special consideration would have to be taken with respect to descendants of such persons, as well as the Perth Agreement (which ended disqualification of spouses of Roman Catholics).
- The abdication of [King Edward VIII](https://en.wikipedia.org/wiki/Edward_VIII) on 11 Dec 1939 is treated as becoming illegitimate on this date.

## Data Sources

The requirements of a genealogy source are as follows.

- Well curated (especially for errors and duplication).
- Updated for new birth/death events in a timely manner.
- Able to be programmatically accessed via an API (or at least downloaded and parsed).
- Provide a sufficient amount of information publicly (it is common for platforms to have private profiles).
- Provide a license to gather and display data with appropriate acknowledgement.
- Ideally handle duplicates internally in an attempt to form a single "source of truth" tree.
- Persons/profiles should minimally contain the following information.
  - Name;
  - Gender;
  - Birth date (and accuracy);
  - Death date (and accuracy);
  - Parent links;
  - Children links.

An incomplete list of sources which meet some of the above criteria are as follows, in order of preference.

- [Geni](https://www.geni.com/people/Sophia-of-Hanover/6000000003879438150): It is the most complete World family tree available online. The [Geni API](https://www.geni.com/projects/The-Geni-API/1124) is based on primary data types of Profiles and Unions. The public API is rate limited to about 1 request per second, which does bottleneck full updates. A large proportion of living profiles of interest are private (e.g. the children of [Zara Tindall](https://www.geni.com/people/Zara-Tindall/6000000003085217960)).
- [WikiTree](https://www.wikitree.com/wiki/Wittelsbach-170): Although not as extensive as Geni, WikiTree appears better curated and the [WikiTree API](https://www.wikitree.com/wiki/Help:API_Documentation) is extremely easy to use fast and at scale. Unfortunately the profiles of living British Royals are set to private (see e.g. descendants of [George VI](https://www.wikitree.com/wiki/Sachsen-Coburg_und_Gotha-4)). This makes it essentially unusable for this project.
- [MyHeritage Family Graph API](https://www.familygraph.com/overview): Due to the extra complication introduced by having separate family trees, this API has not yet been explored as an option, although it does appear very extensive. The MyHeritage website is a paid service.
- [The Peerage](http://www.thepeerage.com/p10139.htm#i101381): A personal project of Darryl Lundy tracking British peerage and European nobility, curated since 1988 and still regularly updated. The information section also contains links to several other large databases.
- [Geneanet](https://en.geneanet.org/): Some detailed trees appear to be available with no official API. For example:
  - [Tim Dowling](https://gw.geneanet.org/tdowling?lang=en&n=of+hanover&oc=0&p=sophia) Family Tree;
  - [Simon de Solomy de Palmas](https://gw.geneanet.org/samlap?lang=en&n=von+hannover&oc=0&p=sophia+dorothea) Family Tree.
- Static [GEDCOM](https://en.wikipedia.org/wiki/GEDCOM) files: These exist scattered around the internet. For example:
  - [Royal92.ged](https://webtreeprint.com/tp_famous_gedcoms.php);
  - [Queen_Eliz_II.ged](http://kingscoronation.com/queen-elizabeth-ii-gedcom-download/).
- [Persons eligible to succeed to the British Throne as of 1 Jan 2011](http://www.wargs.com/essays/succession/2011.html): A monumental snapshot of the line of succession (up to 5753 people) as of 2011. Unfortunately this does not allow for tracking throughout history.

The problem of combining trees from multiple data sources is not simple and has not been attempted. The project currently uses [Geni.com](https://www.geni.com/home) as the sole data source. This may change in the future.

## Python Development

The scripts are currently written and tested using `Python v3.8.5` (however should work down to `v3.6.x`) which must first be installed. To set up the virtual environment with all required packages installed, run the following in Linux (similar commands exist for Windows).

```sh
python -m virtualenv venv
source ./venv/bin/activate
pip install -r requirements.txt
```

### Data Gathering

The data gathering step will gather all relatives and descendants of the Electress Sophia (`profile-56847813`). This may take an hour or so due to the rate limit of the Geni API. Some parallelisation is implemented via threaded workers. The rate limit must be respected or your IP *will* get blocked by Geni's DDOS protection (watch for 429 response).

```sh
python geni.py --seed "profile-56847813" --db db.json --workers 6
```

This script will generate two files. The `db.json` file contains the raw profile and union responses from Geni (expect it to be up to 30 MB in size). This file is then converted to output a simplified row format (`geni.yml`) which is compatible with the main script to calculate the line of succession. The minimal format of entries in this file is as follows (additional fields may be stored for convenience, e.g. for identifying illegitimates).

```yml
- _id: 684074c6-e3bc-5bb2-9948-476a780db75b
  name: Jacob Pleydell-Bouverie, 8th Earl of Radnor
  short_name: Jacob Pleydell-Bouverie, 8th Earl of Radnor
  gender: male
  birth_date: '1927-11-10'
  birth_accuracy: day
  is_alive: false
  death_date: '2008-08-11'
  death_accuracy: day
  parent_ids:
  - aeccd4c9-5377-5ead-90e7-79b5739b889d
  - 07c8a85e-2afc-50f9-b897-24467eab56c7
  children_ids:
  - beb53e66-0a8b-5179-8254-2d710d190ac0
  - 29de1077-f901-55b4-8156-3e08c622e3f5
  - cbd02cdd-a6a5-5dc0-8e86-01cfb925e4e7
  - ead42fd9-cdfa-599e-8bfb-806cc071f793
  - 9129b7b5-b590-5b4f-b6de-1139c696b869
  - c153a3b7-8c24-5997-b425-ca0dd88ebbe1
  external_url: https://www.geni.com/people/Jacob-Pleydell-Bouverie-8th-Earl-of-Radnor/6000000009607153132
```

To run the script again for a complete data gathering step, you will need to delete/rename/change the database file location (otherwise only the conversion step will run). This is done to allow the conversion to run independently of raw data gathering.

### Illegitimate Persons

A list of illegitimate persons is maintained in the [illegitimates.yml](illegitimates.yml) file as an input to the succession calculation. The format is as below. Persons with a key/value pair in the `match` list will be tagged with the `date` given (or their `birth_date` if this is null). Citations should be provided as comments where possible.

```yml
# Abdication of Edward VIII
- date: '1936-12-11'
  match:
    _wt_id: 4928583
    _geni_id: profile-3413739
# Children of William IV and Dorothea Jordan
# George FitzClarence
- date: null
  match:
    _wt_id: 7903372
    _geni_id: profile-20732210
```

### Succession Calculation

The line of succession calculation will use the files in the format above as inputs to calculate and output descendents in order of the line of succession. The script can be run as follows.

```sh
python --descendants geni.yml --seed "0557aac6-264c-5a83-8f1e-a3f6cfac8b9a"
```

The output is `successors.csv` and `successors.json` with the following columns/fields.

- **_id**: An ID unique to the person. Must be non-null.
- **name**: The name of the person. Should be non-null.
- **birth_date**: The best known birth date. Must be non-null.
- **death_date**: The best known death date. May be null; if so then the person is assumed to be alive.
- **illegitimate_date**: The date from which the person became illegitimate. May be null. 
  - Equal to the birth date for persons illegitimate from birth.
  - Equal to the birth date of the earliest illegitimate ancestor if a descendant of an illegitimate ancestor. If the person has a legitimate bloodline then this will take precedence.
  - Equal to the abdication date for Edward VIII.
  - Equal to the effective Perth Agreement date (2015-03-26) for persons born between 2011-10-28 and 2015-03-26 whose succession order is effected. This results in two entries for the same ID; the second entry has a `legitimate_date` of 2015-03-26.
  - In principle can be used for Roman Catholic persons and spouses including changes due to the Perth Agreement, however this behaviour has not yet been implemented.
- **legitimate_date**: The date from which the person becomes legitimate. May be null.
  - This is currently used for handling the Perth Agreement as above.
- **external_url**: Link to person on external data source website. Should be non-null.

The order of the output is the line of succession order *if everyone were still alive today*. The line of succession at any given date can then be determined from this list by a simple algorithm.

1. Filter out not yet born;
2. Filter out dead;
3. Filter out illegitimate;
4. Filter out not yet legitimate.

The ordered list of remaining persons is the line of succession. 

## Web Development

The source for the web application is contained within the [web](./web) directory. Development and testing proceeded using `node v10.19.0`, which must be installed to set up the development environment. Once installed, navigate to the directory and run the following to install dependencies.

```sh
npm install
```

If adding dependencies please run `npm install <package> --save` to ensure they appear in the [package.json](web/package.json). Currently the only dependencies are `d3` for the chart, and `lit-element` to simplify data-binding between JavaScript and the DOM.

The latest `successors.json` file should be placed in the [web/static](./web/static) directory. This can be downloaded directly from [british-succession.co.uk/static/successors.json](https://british-succession.co.uk/static/successors.json) to shortcut the Python script.

Run the automated build watch server.

```sh
npm run watch
```

Run the development static server.

```sh
npm run serve
```

Navigate to http://127.0.0.1:9000 in a web browser.

The web application is made up of a chart and table component. Each path in the chart corresponds to a person. The path height ordering is the line of succession at that point in time. Filled circles represent birth/death. Unfilled circles represent legitimate/illegitimate dates (e.g. the abdication of Edward VIII). By default the chart/table is set to the last updated date. Click the chart to select a different date. Hover over the paths to see the corresponding highlighted row in the table. If the person is not in the line of succession at the selected date (e.g. not yet born or already died) they will appear without a number. Hover over the table to see the highlighted path in the chart. Pan or zoom in/out of the chart to see more detail. Add more lines to the chart using the add icon (initially limited to 500 for load time and performance reasons). Reset to the initial view using the reset icon.

## Contributions

If you want to contribute to this project please do so in the following ways.

- Send me an email at [my-GitHub-username]@gmail.com.
- Open a GitHub [issue](https://github.com/jdclarke5/british-succession/issues) with a bug or feature request.
- Create a [pull request](https://github.com/jdclarke5/british-succession/pulls) to the `dev` branch with suggested code changes/improvements.

I am not a genealogist or even a British Royal Family enthusiast, just a physicist and data/software engineer. My motivation for this project is from the perspective of gathering, cleaning, and presenting the data in a new and interactive way. I welcome contributions from others to improve on what is built from here!

