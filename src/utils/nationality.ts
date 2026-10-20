// api-football returns nationality as a country name (not an ISO code), so the
// old ccode-based flag-emoji trick needs a name -> ISO2 lookup first.
// Covers nationalities that commonly show up in Bulgarian First League squads;
// falls back to no flag for anything unlisted rather than guessing.
const COUNTRY_TO_ISO2: Record<string, string> = {
  Bulgaria: 'BG', Serbia: 'RS', Romania: 'RO', 'North Macedonia': 'MK', Macedonia: 'MK',
  Greece: 'GR', Turkey: 'TR', Croatia: 'HR', 'Bosnia and Herzegovina': 'BA', Bosnia: 'BA',
  Montenegro: 'ME', Albania: 'AL', Kosovo: 'XK', Slovenia: 'SI', Slovakia: 'SK',
  Ukraine: 'UA', Russia: 'RU', Moldova: 'MD', Hungary: 'HU', Poland: 'PL', 'Czech Republic': 'CZ',
  France: 'FR', Spain: 'ES', Portugal: 'PT', Italy: 'IT', Germany: 'DE', Netherlands: 'NL',
  Belgium: 'BE', England: 'GB-ENG', Austria: 'AT', Switzerland: 'CH', Sweden: 'SE', Norway: 'NO',
  Denmark: 'DK', Finland: 'FI', Ireland: 'IE', Iceland: 'IS',
  Brazil: 'BR', Argentina: 'AR', Uruguay: 'UY', Paraguay: 'PY', Colombia: 'CO', Chile: 'CL',
  Venezuela: 'VE', Ecuador: 'EC', Peru: 'PE', Bolivia: 'BO',
  Nigeria: 'NG', Ghana: 'GH', Cameroon: 'CM', 'Ivory Coast': 'CI', "Côte d'Ivoire": 'CI',
  Senegal: 'SN', Mali: 'ML', 'Burkina Faso': 'BF', Guinea: 'GN', 'DR Congo': 'CD', Congo: 'CG',
  Morocco: 'MA', Algeria: 'DZ', Tunisia: 'TN', Egypt: 'EG', 'South Africa': 'ZA', Zambia: 'ZM',
  'Cape Verde': 'CV', Gambia: 'GM', 'Guinea-Bissau': 'GW', Togo: 'TG', Benin: 'BJ',
  USA: 'US', 'United States': 'US', Canada: 'CA', Mexico: 'MX', Jamaica: 'JM',
  Japan: 'JP', 'South Korea': 'KR', China: 'CN', Australia: 'AU', Israel: 'IL', Georgia: 'GE',
  Armenia: 'AM', Azerbaijan: 'AZ', Cyprus: 'CY',
}

function iso2ToFlag(iso2: string): string {
  const code = iso2.slice(-2).toUpperCase()
  return code.replace(/./g, (c) => String.fromCodePoint(c.charCodeAt(0) + 127397))
}

export function nationalityFlag(name: string | null): string | null {
  if (!name) return null
  const iso2 = COUNTRY_TO_ISO2[name]
  return iso2 ? iso2ToFlag(iso2) : null
}
