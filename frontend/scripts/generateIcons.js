const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.resolve('public/Icons');
const OUTPUT_FILE = path.resolve('src/app/lib/architectureIcons.ts');

function normalizeText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function processProvider(provider) {
  const providerPath = path.join(ICONS_DIR, provider);
  if (!fs.existsSync(providerPath)) return [];

  const items = [];
  
  if (provider === 'generic') {
    const files = fs.readdirSync(providerPath);
    files.forEach(file => {
      if (!file.endsWith('.svg') && !file.endsWith('.png')) return;
      
      const basename = file.replace(/\.(svg|png)$/, '');
      const rawName = basename.replace(/^[0-9a-f]+_/, '').replace(/_/g, ' ').replace(/-/g, ' ');
      const nameParts = rawName.split(' ').filter(Boolean);
      
      let name = nameParts.join(' ');
      if (!name) name = basename;
      
      items.push({
        id: `${provider}-${basename.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: name,
        type: 'Generic Component',
        provider: 'generic',
        section: 'Generic',
        iconPath: `/Icons/${provider}/${file}`,
        keywords: nameParts.map(p => p.toLowerCase()).filter(p => p.length > 2)
      });
    });
    return items;
  }

  // Provider with subcategories (aws, gcp, azure)
  const categories = fs.readdirSync(providerPath).filter(f => fs.statSync(path.join(providerPath, f)).isDirectory());
  
  categories.forEach(category => {
    const categoryPath = path.join(providerPath, category);
    const files = fs.readdirSync(categoryPath);
    
    files.forEach(file => {
      if (!file.endsWith('.svg') && !file.endsWith('.png')) return;
      
      const basename = file.replace(/\.(svg|png)$/, '');
      // Strip hash prefix e.g. "06db6a9207_" or "003a1f4122_._"
      let cleanName = basename.replace(/^[0-9a-f]+_(\._)?/, '');
      
      // Cleanup common prefixes like Arch_, Res_, Amazon-, AWS-, Icon-Service- etc.
      cleanName = cleanName
        .replace(/^(Arch|Res)_/i, '')
        .replace(/^[0-9]+-icon-service-/i, '')
        .replace(/^(Amazon|AWS|Google|Azure)-/i, '')
        .replace(/_(16|32|48|64)$/, ''); // Strip trailing size hints
        
      cleanName = cleanName.replace(/_/g, ' ').replace(/-/g, ' ').trim();
      const keywords = normalizeText(cleanName).split(' ').filter(k => k.length > 1);
      
      // Add provider prefix to keywords
      if (provider !== 'generic') keywords.push(provider);
      keywords.push(category);
      
      // Capitalize category
      const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
      const capitalizedProvider = provider === 'aws' ? 'AWS' : provider === 'gcp' ? 'GCP' : provider === 'azure' ? 'Azure' : 'Generic';
      
      const type = `${capitalizedProvider} ${capitalizedCategory}`;
      const section = `${capitalizedProvider} / ${capitalizedCategory}`;
      
      items.push({
        id: `${provider}-${category}-${basename.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30)}`,
        name: cleanName || basename,
        type,
        provider,
        section,
        iconPath: `/Icons/${provider}/${category}/${file}`,
        keywords: Array.from(new Set(keywords))
      });
    });
  });

  return items;
}

function generate() {
  const providers = ['aws', 'gcp', 'azure', 'generic'];
  let allItems = [];
  
  providers.forEach(p => {
    const items = processProvider(p);
    allItems = allItems.concat(items);
  });
  
  console.log(`Generated ${allItems.length} total primitive items.`);
  
  // Create file content
  const fileContent = `export interface PrimitiveItem {
  id: string;
  name: string;
  type: string;
  provider: 'aws' | 'gcp' | 'azure' | 'generic';
  section: string;
  iconPath: string;
  keywords: string[];
}

export const DEFAULT_ARCHITECTURE_ICON = '/Icons/generic/kubernetes.svg';

export const PRIMITIVE_ITEMS: PrimitiveItem[] = ${JSON.stringify(allItems, null, 2)};

const normalizeText = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const resolvePrimitiveByText = (...candidates: Array<string | undefined | null>): PrimitiveItem | null => {
  const source = normalizeText(candidates.filter(Boolean).join(' '));
  if (!source) return null;

  const exact = PRIMITIVE_ITEMS.find((item) => {
    const name = normalizeText(item.name);
    return source.includes(name) || item.keywords.some((keyword) => source.includes(normalizeText(keyword)));
  });

  return exact || null;
};

export const iconForNode = (label?: string, type?: string): string => {
  return resolvePrimitiveByText(label, type)?.iconPath || DEFAULT_ARCHITECTURE_ICON;
};
`;

  fs.writeFileSync(OUTPUT_FILE, fileContent);
  console.log('Successfully wrote to ' + OUTPUT_FILE);
}

generate();
