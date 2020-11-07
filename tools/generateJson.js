import Promise from 'bluebird';
import { setFatalError, reportFatalErrors, hasFatalErrors } from './fatalErrors';
import { projectPath, settings } from './settings';
console.info('processed in generateJson', projectPath);
const source = require('js-yaml').safeLoad(require('fs').readFileSync(`${projectPath}/processed_landscape.yml`));
const traverse = require('traverse');
const _ = require('lodash');
const { emojify } = require('node-emoji')

import actualTwitter from './actualTwitter';
import saneName from '../src/utils/saneName';
import formatCity from '../src/utils/formatCity';
import pack from '../src/utils/packArray';

async function failOnSingleError(text) {
  console.info(`FATAL: ${text}`);
  setFatalError(text);
  await reportFatalErrors();
  process.exit(1);
}

async function failOnMultipleErrors(text) {
  console.info(`FATAL: ${text}`);
  setFatalError(text);
}

function sortFn(x) {
  if (_.isString(x)) {
    return x.trim().toLowerCase();
  }
  return x;
}

function getItemMembershipKey(item) {
  return item.unnamed_organization ? item.name : item.crunchbase;
}

async function getMembers() {
  const membershipFile = require('path').resolve(projectPath, 'members.yml');
  const hasMembershipFile = require('fs').existsSync(membershipFile);
  const membershipCategoryName = settings.global.membership;
  if (hasMembershipFile) {
    await failOnSingleError(`members.yml is not supported anymore. Instead, we need a 'membership' key in a 'global' setting of a settings.yml file`);
  }
  if (!membershipCategoryName) {
    await failOnSingleError(`membership category (global.membership in settings.yml) is not present. Please add a category to the settings.yml file`);
  }
  console.info(`Fetching members from ${membershipCategoryName} category`);
  const directResult = {};
  const tree = traverse(source);
  console.info('Processing the tree in generateJson');
  tree.map(function(node) {
    if (node && node.category === null && node.name === settings.global.membership) {
      node.subcategories.forEach(function(subcategory) {
        directResult[subcategory.name] = subcategory.items.map( (item) => getItemMembershipKey(item));
      });
    }
  });
  return directResult;
}

async function main () {
  // console.info(members);




  const formatDate = function(x) {
    let result;
    if (!x) {
      result =  x;
    }
    const delta = new Date().getTime() - new Date(x).getTime();
    const day = 86400 * 1000;
    if (delta < 7 * day) {
      result = {text: 'this week', value: '990'};
    }
    else if (delta < 14 * day) {
      result = {text: 'last week', value: '980'}
    }
    else if (delta < 21 * day) {
      result = {text: '3 weeks ago', value: '970'}
    }
    else if (delta < (30 * 1 + 15) * day) {
      result = {text: 'about a month', value: '960'}
    }
    else if (delta < (30 * 2 + 15) * day) {
      result = {text: '2 months ago', value: '950'}
    }
    else if (delta < (30 * 3 + 15) * day) {
      result = {text: '3 months ago', value: '940'}
    }
    else if (delta < (30 * 4 + 15) * day) {
      result = {text: '4 months ago', value: '930'}
    }
    else if (delta < (30 * 5 + 15) * day) {
      result = {text: '5 months ago', value: '920'}
    }
    else if (delta < (30 * 6 + 15) * day) {
      result = {text: '6 months ago', value: '910'}
    }
    else if (delta < (30 * 7 + 15)  * day) {
      result = {text: '7 months ago', value: '900'}
    }
    else if (delta < (30 * 8 + 15) * day) {
      result = {text: '8 months ago', value: '890'}
    }
    else if (delta < (30 * 9 + 15) * day) {
      result = {text: '9 months ago', value: '880'}
    }
    else if (delta < (30 * 10 + 15) * day) {
      result = {text: '10 months ago', value: '870'}
    }
    else if (delta < (30 * 11 + 15) * day) {
      result = {text: '11 months ago', value: '860'}
    } else {
      result = x;
    }
    if (result && result.text) {
      result.original = x;
    }
    return result;
  };

  const items = [];
  const tree = traverse(source);
  tree.map(function(node) {
    if (node && node.item === null) {
      const parts = this.parents.filter(function(p) {
        return p.node.category === null || p.node.subcategory === null;
      }).map(function(p) {
        return p.node.name;
      });
      const getTwitter = function() {
        return actualTwitter(node, node.crunchbase_data);
      };
      const getDescription = function() {
        if (! _.isUndefined(node.description)) {
          return node.description;
        }
        if (node.github_data && node.github_data.description) {
          return emojify(node.github_data.description);
        }
        if (node.crunchbase_data && node.crunchbase_data.description) {
          return node.crunchbase_data.description;
        }
        return null;
      };
      const getLicense = function() {
        if ((node.hasOwnProperty('open_source') && !node.open_source) || !node.github_data) {
          return 'NotOpenSource';
        }

        if (node.github_data) {
          return node.github_data.license;
        }

        return 'Unknown License';
      }
      const getAmount = function() {
        if (node.yahoo_finance_data) {
          return node.yahoo_finance_data.market_cap;
        }
        if (node.crunchbase_data) {
          return node.crunchbase_data.funding;
        }
        return 'N/A';
      }
      const getTicker = function() {
        if (node.yahoo_finance_data) {
          return node.yahoo_finance_data.marketCap;
        }
        return (node.crunchbase_data || {}).effective_ticker;
      };

      const getCommitLink = function(link) {
        if (!link) {
          return null;
        }
        return 'https://github.com' + link;
      }

      const isEndUser = () => {
        if (node.enduser) {
          return true;
        }

        return (settings.membership[parts[1]] || {}).enduser;
      };

      // calculating a membership


      items.push({...node,
        project: node.project,
        firstCommitDate: formatDate((node.github_start_commit_data || {}).start_date),
        firstCommitLink: getCommitLink((node.github_start_commit_data || {}).start_commit_link),
        latestCommitDate: formatDate((node.github_data || {}).latest_commit_date),
        latestCommitLink: getCommitLink((node.github_data || {}).latest_commit_link),
        releaseDate: formatDate((node.github_data || {}).release_date),
        releaseLink: (node.github_data || {}).release_link,
        commitsThisYear: _.sum(((node.github_data || {}).contributions || '').split(';').map( (x) => +x)),
        contributorsCount: (node.github_data || {}).contributors_count,
        contributorsLink: (node.github_data || {}).contributors_link,
        language: (((node.github_data || {}).languages || [])[0] || {}).name || null,
        stars: (node.github_data || {}).stars,
        license: getLicense(),
        twitter: getTwitter(),
        latestTweetDate: formatDate((node.twitter_data || {}).latest_tweet_date),
        description: getDescription(),
        organization: (node.crunchbase_data || {}).name,
        crunchbaseData: node.crunchbase_data,
        path: parts.join(' / '),
        landscape: parts.join(' / '),
        category: parts[0],
        amountKind: (node.crunchbase_data || {}).kind,
        amount: getAmount(),
        ticker: getTicker(),
        oss: getLicense() !== 'NotOpenSource',
        hasRepo: node.github_data ? true : false,
        href: `logos/${(node.image_data || {}).fileName}`,
        bestPracticeBadgeId: (node.best_practice_data || {}).badge,
        bestPracticePercentage: (node.best_practice_data || {}).percentage,
        enduser: isEndUser()
      });
    }
  });
  const itemsWithExtraFields = items.map(function(item) {
    const getLinkedin = function(el) {
      if (!el.linkedin) {
        return null;
      }
      return el.linkedin.replace(/\?.*/, '');
    }


    if (item.crunchbase_data) {
      item.crunchbaseData.numEmployeesMin = item.crunchbaseData.num_employees_min;
      item.crunchbaseData.numEmployeesMax = item.crunchbaseData.num_employees_max;
      item.crunchbaseData.tickerSymbol = item.crunchbaseData.ticker_symbol;
      item.crunchbaseData.linkedin = getLinkedin(item.crunchbaseData);
    }
    delete item.crunchbase_data;
    delete item.twitter_data;
    if (item.crunchbaseData) {
      delete item.crunchbaseData.num_employees_min;
      delete item.crunchbaseData.num_employees_max;
      delete item.crunchbaseData.ticker_symbol;
    }
    delete item.best_practice_data;
    delete item.market_cap;
    delete item.first_commit_date;
    delete item.latest_commit_date;
    delete item.release_date;
    delete item.release_link;
    delete item.first_commit_link;
    delete item.latest_commit_link;
    delete item.item;
    const id = saneName(item.name);
    return {
      ...item,
      id: id,
      flatName: item.name.replace(' (member)', '').replace(' (supporter)', '')
    }
  });

  if (settings.global.flags.companies) {
    // Handle companies in a special way
    const hasCompanyCategory = (function() {
      var result = false;
      tree.map(function(node) {
        if (node && node.category === null && node.name === settings.global.flags.companies) {
          result = true;
        }
      });
      return result;
    })();
    if (!hasCompanyCategory) {
      await failOnSingleError(`can not find a category with name: "${settings.global.flags.companies}". We use that category to get a list of member companies`);
    }

    _.each(itemsWithExtraFields, function(item) {
      if (item.category === settings.global.flags.companies) {
        item.project = 'company';
        item.relation = 'company';
      }
    });
  }

  if (settings.global.flags.hide_license_for_categories) {
    _.each(itemsWithExtraFields, function(item) {
      if (settings.global.flags.hide_license_for_categories.indexOf(item.category) !== -1) {
        item.hideLicense = true;
      }
    });
  }


  // protect us from duplicates
  var hasDuplicates = false;
  await Promise.mapSeries(_.values(_.groupBy(itemsWithExtraFields, 'name')),async function(duplicates) {
    if (duplicates.length > 1 && duplicates.find(({allow_duplicate_repo}) => !allow_duplicate_repo)) {
      hasDuplicates = true;
      await Promise.mapSeries(duplicates, async function(duplicate) {
        await failOnMultipleErrors(`Duplicate item: ${duplicate.organization} ${duplicate.name} at path ${duplicate.path}`);
      });
    }
  });
  if (hasDuplicates) {
    await reportFatalErrors();
    require('process').exit(1);
  }

  // protect us from duplicate repo_urls
  var hasDuplicateRepos = false;
  await Promise.mapSeries(_.values(_.groupBy(itemsWithExtraFields.filter( (x) => !!x.repo_url), 'repo_url')), async function(duplicates) {
    if (duplicates.length > 1 && duplicates.find(({allow_duplicate_repo}) => !allow_duplicate_repo)) {
      hasDuplicateRepos = true;
      await Promise.mapSeries(duplicates, async function(duplicate) {
        await failOnMultipleErrors(`Duplicate repo: ${duplicate.repo_url} on ${duplicate.name} at path ${duplicate.path}`);
      });
    }
  });
  if (hasDuplicateRepos) {
    await reportFatalErrors();
    require('process').exit(1);
  }

  /*
  var hasEmptyCrunchbase = false;
  await Promise.mapSeries(itemsWithExtraFields, async function(item) {
    if (!item.crunchbaseData) {
      hasEmptyCrunchbase = true;
      await failOnMultipleErrors(`${item.name} either has no crunchbase entry or it is invalid`);
    }
  });
  if (hasEmptyCrunchbase) {
    await reportFatalErrors();
    require('process').exit(1);
  }

  var hasBadCrunchbase = false;
  await Promise.mapSeries(itemsWithExtraFields, async function(item) {
    if (item.crunchbase && item.crunchbase.indexOf('https://www.crunchbase.com/organization/') !== 0) {
      hasBadCrunchbase = true;
      await failOnMultipleErrors(`${item.name}  has a crunchbase ${item.crunchbase} which does not start with 'https://www.crunchbase.com/organization'`);
    }
  });
  if (hasBadCrunchbase) {
    await reportFatalErrors();
    require('process').exit(1);
  }
  */

  var hasBadHomepage = false;
  await Promise.mapSeries(itemsWithExtraFields, async function(item) {
    if (!item.homepage_url) {
      hasBadHomepage = true;
      await failOnMultipleErrors(`${item.name}  has an empty or missing homepage_url`);
    } else if (!item.homepage_url.startsWith('http://') && !item.homepage_url.startsWith('https://')) {
      hasBadHomepage = true;
      await failOnMultipleErrors(`${item.name}  homepage_url ${item.homepage_url} should start from http:// or https://`);
    }
  });
  if (hasBadHomepage) {
    await reportFatalErrors();
    require('process').exit(1);
  }

  await Promise.mapSeries(itemsWithExtraFields, async function(item) {
    if (item.twitter && !item.latestTweetDate) {
      if (item.latestTweetDate === null) {
        console.info(`Warning: ${item.name} has a twitter ${item.twitter} with no entries`);
      } else {
        console.info(`Warning: ${item.name} has a twitter ${item.twitter} which is invalid or we just can not fetch its tweets`);
      }
    }
  });

  var hasWrongTwitterUrls = false;
  await Promise.mapSeries(itemsWithExtraFields, async function(item) {
    if (item.twitter && item.twitter.split('/').slice(-1)[0] === '') {
      await failOnMultipleErrors(`${item.name} has a twitter ${item.twitter} which ends with /`);
      hasWrongTwitterUrls = true;
    }
    if (item.twitter && item.twitter.indexOf('https://twitter.com/') !== 0 && item.twitter.indexOf('http://twitter.com/') !== 0) {
      await failOnMultipleErrors(`${item.name} has a twitter ${item.twitter} which does not start with https://twitter.com/ or http://twitter.com/`);
      hasWrongTwitterUrls = true;
    }
  });
  if (hasWrongTwitterUrls) {
    await reportFatalErrors();
    require('process').exit(1);
  }

  var hasBadImages = false;
  await Promise.mapSeries(itemsWithExtraFields, async function(item) {
    if (!item.image_data) {
      await failOnMultipleErrors(`Item ${item.name} has no image_data`);
      hasBadImages = true;
    } else {
      const imageFileName = `${projectPath}/cached_logos/` + item.image_data.fileName;
      if (!require('fs').existsSync(imageFileName)) {
        await failOnMultipleErrors(`Item ${item.name} does not have a file ${imageFileName} on the disk`);
        hasBadImages = true;
      } else {
        const fileSize = require('fs').statSync(imageFileName).size;
        if (fileSize < 100) {
          await failOnMultipleErrors(`Item ${item.name} has a file ${imageFileName} size less than 100 bytes`);
          hasBadImages = true;
        }
      }
    }
  });
  if(hasBadImages) {
    await reportFatalErrors();
    require('process').exit(-1);
  }


  async function removeNonReferencedImages() {
    const fs = require('fs');
    const existingFiles = fs.readdirSync(`${projectPath}/hosted_logos`);
    const allowedFiles = itemsWithExtraFields.map( (e) => e.logo ).filter( (e) => !!e);
    await Promise.mapSeries(existingFiles, async function(existingFile) {
      const fileName = existingFile;
      if (allowedFiles.indexOf(fileName) === -1){
        fs.unlinkSync(`${projectPath}/hosted_logos/` + existingFile);
      }
    })
  }
  await removeNonReferencedImages();

  var hasBadLandscape = false;
  await Promise.mapSeries(settings.big_picture.main.elements, async function(element) {
    const hasCompanyCategory = (function() {
      var result = false;
      tree.map(function(node) {
        if (node && node.category === null && node.name === element.category) {
          result = true;
        }
      });
      return result;
    })();
    if (element.category && !hasCompanyCategory) {
      await failOnMultipleErrors(`big picture configration in settings.yml has an issue:
      there is a big_picture.main.elements entry with category: "${element.category}" but we do not have that category "${element.category}" in the landscape.yml!`);
      hasBadLandscape = true;
    }
  });
  if (hasBadLandscape) {
    await reportFatalErrors();
    process.exit(1);
  }

  var hasBadFieldWithSpaces = false;
  await Promise.mapSeries(itemsWithExtraFields, async function(item) {
    if (!_.isEmpty(item.twitter) && item.twitter.indexOf(' ') !== -1) {
      hasBadFieldWithSpaces = true;
      await failOnMultipleErrors(`${item.name} has a twitter ${item.twitter} with spaces`);
    }
    if (!_.isEmpty(item.crunchbase) && item.crunchbase.indexOf(' ') !== -1) {
      hasBadFieldWithSpaces = true;
      await failOnMultipleErrors(`${item.name} has a crunchbase ${item.crunchbase} with spaces`);
    }
    if (!_.isEmpty(item.repo_url) && item.repo_url.indexOf(' ') !== -1) {
      hasBadFieldWithSpaces = true;
      await failOnMultipleErrors(`${item.name} has a repo_url ${item.repo_url} with spaces`);
    }
    if (!_.isEmpty(item.homepage_url) && item.homepage_url.indexOf(' ') !== -1) {
      hasBadFieldWithSpaces = true;
      await failOnMultipleErrors(`${item.name} has a homepage_url ${item.homepage_url} with spaces`);
    }
  });
  if (hasBadFieldWithSpaces) {
    await reportFatalErrors();
    process.exit(-1);
  }


  // now update membership, only after we've checked crunchbase issues properly
  // const members = await getMembers();
  _.each(itemsWithExtraFields, function(item) {
    /*
    const membership = (function() {
      // direct membership
      const directMembership = _.findKey(members, (v) => v && v.indexOf(getItemMembershipKey(item)) !== -1);
      if (directMembership) {
        return directMembership;
      }
      const parentWithMembership = _.find(item.crunchbaseData.parents, function(parent) {
        return _.findKey(members, (v) => v && v.indexOf(parent) !== -1);
      });
      // a first parent of a given item which has a given membership
      if (parentWithMembership) {
        const tree = traverse(source);
        let parentName;
        tree.map(function(node) {
          if (node && node.crunchbase === parentWithMembership) {
            parentName = node.crunchbase_data.name
          }
        });
        let myName =  item.crunchbaseData.name;
        const membership = _.findKey(members, (v) => v && v.indexOf(parentWithMembership) !== -1);
        console.info(`Assigning ${membership} membership on ${item.name} (${myName}) because its parent ${parentName} has ${membership} membership`);
        return membership;
      }
      return false;
    })();
    */
    item.member = true;
    const {relation, isSubsidiaryProject} = (function() {
      if (item.project) {
        return {relation: item.project, isSubsidiaryProject: false};
      }
      if (item.member) {
        return {relation: 'member', isSubsidiaryProject: false};
      }
      if (item.crunchbase === settings.global.self) {
        return {relation: 'member', isSubsidiaryProject: true};
      }
      return {relation: false, isSubsidiaryProject: false};
    })();
    item.relation = item.relation || relation; //could be set before explicitly as a 'company'
    item.isSubsidiaryProject = isSubsidiaryProject;
  });

  /*
  const hostedCategories = settings.relation.values.filter(({ id }) => id === 'hosted')
    .flatMap(({ children }) => children)
    .map(({ id }) => id)

  itemsWithExtraFields.forEach(item => {
    const { project, crunchbase, crunchbaseData, name } = item
    const { parents } = crunchbaseData
    if (hostedCategories.includes(project) && crunchbase !== settings.global.self && !parents.includes(settings.global.self)) {
      failOnMultipleErrors(`Project ${name} has been added to ${project} category but does not belong to ${settings.global.short_name}`);
    }
  })

  if (hasFatalErrors()) {
    process.exit(1);
  }
  */

  const extractOptions = function(name) {
    return _.chain(itemsWithExtraFields).map(function(x) {
      return x[name];
    }).filter(function(x) {
      return !!x
    }).sortBy(sortFn).uniq().map(function(x) {
      return {
        id: x,
        url: saneName(x)
      };
    }).value();
  };

  const getGroupingLabel = function({category, node}) {
    const categoriesToHide = (settings.global.flags || {}).hide_category_from_subcategories || [];
    if (categoriesToHide.includes(node.name)) {
      return node.name;
    } else {
      return category + ' - ' + node.name;
    }
  }

  const generateLandscapeHierarchy = function() {
    var result = [];
    tree.map(function(node) {
      if (node && node.category === null) {
        result.push({
          id: node.name,
          url: saneName(node.name),
          level: 1,
          children: []
        });
      }
      if (node && node.subcategory === null) {
        const category = this.parents.filter(function(p) {
          return p.node.category === null;
        }).map(function(p) {
          return p.node.name;
        })[0];
        const categoryEntry = _.find(result, {level: 1, id: category});
        const entry = {
          id: category + ' / ' + node.name,
          parentId: category,
          label: node.name,
          groupingLabel: getGroupingLabel({category, node}),
          url: saneName(node.name),
          level: 2
        }
        categoryEntry.children.push(entry.id);
        result.push(entry);
      }
    });
    return result;
  };

  /*
   * Generates a filter for a two level list.
   * The field should look like this:
   *
   * foo:
   *   primary: bar
   *   secondary:
   *     - bax
   *     - baz
   * 
   * See the mode field for an example
   */

  const extractNestedListOptions = function(field) {
    const values = _.uniq(items.flatMap(function(item) {
      if (item[field]) {
          // console.info("Generating lookup for "+field+":  found entry with mode"+JSON.stringify(item.mode));
          return item[field].flatMap((ie) => ie.secondary.map(function(s) {
            return {primary: ie.primary, secondary: s}
          }));
      }
      return undefined;
    }));
    // console.info("Generating lookup for "+field+":  after mapping" + JSON.stringify(values));
    const defined = _.filter(values, (x) => x != undefined);
    // console.info("Generating lookup for "+field+":  after filtering" + JSON.stringify(defined));
    const grouped  = _.groupBy(defined, (x) => x.primary);
    // console.info("Generating lookup for "+field+":  after grouping" + JSON.stringify(grouped));
    const keys = _.sortBy(_.keys(grouped), (primary) => primary);
    // console.info("Generating lookup for "+field+":  after sorting" + JSON.stringify(keys));
    const result = [];
    _.each(keys, function(key) {
      const value = grouped[key];
      // console.info("Generating lookup for "+field+":  value = " + JSON.stringify(value));
      const children = _.uniqBy(value, (x) => x.secondary);
      // console.info("Generating lookup for "+field+":  children = " + JSON.stringify(children));
      result.push({
        id: key,
        url: saneName(key),
        level: 1,
        children: children.map( (x) => (x.secondary))
      });
    });
    return result;
  }

  /*
   * Generates a filter for a single level list.
   * The field should look like this:
   *
   * foo:
   *  - bar
   *  - baz
   * 
   * See the region field for an example
   */

  const extractListOptions = function(field) {
    return _.chain(items).flatMap(function(item) {
      return item[field];
    }).filter(function(x) {
      return !!x;
    }).sortBy(sortFn).uniq().map(function(x) {
      return {
        id: x,
        url: saneName(x)
      };
    }).value();
  }


  const generateLicenses = function() {
    const otherLicenses = extractOptions('license').filter(function(x) {
      return x.id !== 'NotOpenSource';
    });
    return [{
      id: 'NotOpenSource',
      label: 'Not Open Source',
      url: saneName('NotOpenSource'),
      level: 1,
      children: []
    }, {
      id: 'Open Source',
      label: 'Open Source',
      url: saneName('Open Source'),
      level: 1,
      children: _.map(otherLicenses, 'id')
    }].concat(otherLicenses.map(function(license){
      return {
        ...license,
        parentId: 'Open Source',
        level: 2
      };
    }));
  };

  const generateCrunchbaseSlugs = () => {
    const urls = _.flatten(itemsWithExtraFields.map(({crunchbase, crunchbaseData}) => [crunchbase, ...crunchbaseData.parents || []]));
    const slugs = urls.filter((url) => url).map((crunchbaseUrl) => crunchbaseUrl.split("/").pop());
    return [...new Set(slugs)].sort()
  }

  const generateLanguages = () => {
    const languages = _.flatten(itemsWithExtraFields.map(({github_data}) => ((github_data || {}).languages || []).map( (x) => encodeURIComponent(x.name) ) ));
    return _.orderBy(_.uniq(languages));
  }

  const lookups = {
    organization: pack(extractOptions('organization')),
    landscape: pack(generateLandscapeHierarchy()),
    license: pack(generateLicenses()),
    mode: pack(extractNestedListOptions('mode')),
    region: pack(extractListOptions('region')),
    crunchbaseSlugs: [],
    languages: generateLanguages(),
  }

  require('fs').writeFileSync(`${projectPath}/data.json`, JSON.stringify(itemsWithExtraFields, null, 2));
  require('fs').writeFileSync(`${projectPath}/lookup.json`, JSON.stringify(lookups, null, 2));
}
main().catch(async function(ex) {
  console.info(ex);
  setFatalError(ex.message);
  await reportFatalErrors();
  process.exit(1);
});
