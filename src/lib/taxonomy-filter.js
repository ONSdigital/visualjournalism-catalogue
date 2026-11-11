const labels = {
  businessindustryandtrade: 'Business, industry and trade',
  economy: 'Economy',
  employmentandlabourmarket: 'Employment and labour market',
  peoplepopulationandcommunity: 'People, population and community',
  business: 'Business',
  constructionindustry: 'Construction industry',
  internationaltrade: 'International trade',
  itandinternetindustry: 'IT and internet industry',
  economicoutputandproductivity: 'Economic output and productivity',
  environmentalaccounts: 'Environmental accounts',
  governmentpublicsectorandtaxes: 'Government, public sector and taxes',
  grossdomesticproductgdp: 'Gross domestic product (GDP)',
  grossvalueaddedgva: 'Gross value added (GVA)',
  inflationandpriceindices: 'Inflation and price indices',
  investmentspensionsandtrusts: 'Investments, pensions and trusts',
  nationalaccounts: 'National accounts',
  regionalaccounts: 'Regional accounts',
  peopleinwork: 'People in work',
  peoplenotinwork: 'People not in work',
  armedforcescommunity: 'Armed forces community',
  birthsdeathsandmarriages: 'Births, deaths and marriages',
  crimeandjustice: 'Crime and justice',
  culturalidentity: 'Cultural identity',
  educationandchildcare: 'Education and childcare',
  healthandsocialcare: 'Health and social care',
  housing: 'Housing',
  leisureandtourism: 'Leisure and tourism',
  personalandhouseholdfinances: 'Personal and household finances',
  populationandmigration: 'Population and migration',
  wellbeing: 'Wellbeing',
  activitysizeandlocation: 'Activity, size and location',
  businessservices: 'Business services',
  output: 'Output',
  productivitymeasures: 'Productivity measures',
  publicservicesproductivity: 'Public services productivity',
  publicsectorfinance: 'Public sector finance',
  publicspending: 'Public spending',
  balanceofpayments: 'Balance of payments',
  satelliteaccounts: 'Satellite accounts',
  supplyandusetables: 'Supply and use tables',
  uksectoraccounts: 'UK sector accounts',
  grossdisposablehouseholdincome: 'Gross disposable household income',
  earningsandworkinghours: 'Earnings and working hours',
  employmentandemployeetypes: 'Employment and employee types',
  labourproductivity: 'Labour productivity',
  economicinactivity: 'Economic inactivity',
  outofworkbenefits: 'Out of work benefits',
  unemployment: 'Unemployment',
  ageing: 'Ageing',
  conceptionandfertilityrates: 'Conception and fertility rates',
  deaths: 'Deaths',
  divorce: 'Divorce',
  families: 'Families',
  lifeexpectancies: 'Life expectancies',
  livebirths: 'Live births',
  marriagecohabitationandcivilpartnerships: 'Marriage, cohabitation and civil partnerships',
  ethnicity: 'Ethnicity',
  religion: 'Religion',
  sexuality: 'Sexuality',
  causesofdeath: 'Causes of death',
  childhealth: 'Child health',
  conditionsanddiseases: 'Conditions and diseases',
  disability: 'Disability',
  healthandlifeexpectancies: 'Health and life expectancies',
  healthandwellbeing: 'Health and wellbeing',
  healthcaresystem: 'Health care system',
  healthinequalities: 'Health inequalities',
  mentalhealth: 'Mental health',
  socialcare: 'Social care',
  expenditure: 'Expenditure',
  incomeandwealth: 'Income and wealth',
  internationalmigration: 'International migration',
  migrationwithintheuk: 'Migration within the UK',
  populationestimates: 'Population estimates',
  populationprojections: 'Population projections'
};

export function taxonomyLabel(value) {
  if (!value || value === '~') return 'Not further classified';
  return labels[value] || value.replaceAll('-', ' ').replace(/^./, first => first.toUpperCase());
}

export function taxonomyPath(release) {
  return [release.theme, release.topic, release.subtopic].map(value => value || '~').join('/');
}

function covers(parent, path) {
  return path === parent || path.startsWith(`${parent}/`);
}

export function normalizeTaxonomy({ mode = 'exclude', paths = [] } = {}) {
  const valid = [...new Set(paths.filter(path => typeof path === 'string'
    && /^(?:[a-z0-9][a-z0-9-]*|~)(?:\/(?:[a-z0-9][a-z0-9-]*|~)){0,2}$/i.test(path)))].sort();
  return {
    mode: mode === 'include' ? 'include' : 'exclude',
    paths: valid.filter(path => !valid.some(parent => parent !== path && covers(parent, path)))
  };
}

export function taxonomyMatchesPath(path, { mode = 'exclude', paths = [] } = {}) {
  const listed = paths.some(parent => covers(parent, path));
  return mode === 'include' ? listed : !listed;
}

export function matchesTaxonomy(release, selection) {
  return taxonomyMatchesPath(taxonomyPath(release), selection);
}

export function buildTaxonomy(releases) {
  const roots = [];
  const nodes = new Map();
  for (const release of releases) {
    const leafPath = taxonomyPath(release);
    const segments = leafPath.split('/');
    let siblings = roots;
    for (let level = 0; level < segments.length; level++) {
      const path = segments.slice(0, level + 1).join('/');
      let node = nodes.get(path);
      if (!node) {
        node = { path, label: taxonomyLabel(segments[level]), children: [], leafPaths: [] };
        nodes.set(path, node);
        siblings.push(node);
      }
      if (!node.leafPaths.includes(leafPath)) node.leafPaths.push(leafPath);
      siblings = node.children;
    }
  }
  const sortNodes = siblings => {
    siblings.sort((first, second) => first.label.localeCompare(second.label));
    for (const node of siblings) sortNodes(node.children);
  };
  sortNodes(roots);
  return roots;
}

export function taxonomyState(node, selection) {
  const selected = node.leafPaths.filter(path => taxonomyMatchesPath(path, selection)).length;
  return { checked: selected === node.leafPaths.length, mixed: selected > 0 && selected < node.leafPaths.length, selected };
}

export function toggleTaxonomy(roots, selection, path, checked) {
  const allPaths = roots.flatMap(node => node.leafPaths);
  const selected = new Set(allPaths.filter(leaf => taxonomyMatchesPath(leaf, selection)));
  for (const leaf of allPaths.filter(leaf => covers(path, leaf))) {
    if (checked) selected.add(leaf);
    else selected.delete(leaf);
  }
  const frontier = include => {
    const paths = [];
    const visit = node => {
      if (node.leafPaths.every(leaf => selected.has(leaf) === include)) paths.push(node.path);
      else node.children.forEach(visit);
    };
    roots.forEach(visit);
    return normalizeTaxonomy({ mode: include ? 'include' : 'exclude', paths });
  };
  const included = frontier(true);
  const excluded = frontier(false);
  const length = candidate => {
    const params = new URLSearchParams();
    if (candidate.mode === 'include') params.set('taxMode', 'include');
    for (const branch of candidate.paths) params.append('tax', branch);
    return params.toString().length;
  };
  return length(included) < length(excluded) ? included : excluded;
}