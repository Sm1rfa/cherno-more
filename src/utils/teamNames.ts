// Known Bulgarian First Professional League team names (Latin → Cyrillic)
// Using a lookup table because generic transliteration fails on city names like Кърджали.
// Includes both goal.bg's and SportScore's naming variants for the same clubs
// (e.g. "Arda" vs "Arda Kardzhali", "FC Dunav Ruse" vs "Dunav Ruse").
const TEAM_BG: Record<string, string> = {
  'Arda Kardzhali':          'Арда Кърджали',
  'Arda':                    'Арда Кърджали',
  'Botev Plovdiv':           'Ботев Пловдив',
  'Botev Vratsa':            'Ботев Враца',
  'Cherno More Varna':       'Черно Море Варна',
  'CSKA 1948':               'ЦСКА 1948',
  'CSKA 1948 Sofia':         'ЦСКА 1948',
  'CSKA Sofia':              'ЦСКА София',
  'Dunav Ruse':              'Дунав Русе',
  'FC Dunav Ruse':           'Дунав Русе',
  'Levski Sofia':            'Левски София',
  'Lokomotiv Plovdiv':       'Локомотив Пловдив',
  'Lokomotiv Sofia':         'Локомотив София',
  'PFC Lokomotiv Sofia 1929':'ПФК Локомотив София 1929',
  'Ludogorets Razgrad':      'Лудогорец Разград',
  'Ludogorets':              'Лудогорец',
  'Septemvri Sofia':         'Септември София',
  'FK Septemvri Sofia':      'Септември София',
  'Slavia Sofia':            'Славия София',
  'Spartak Varna':           'Спартак Варна',
  'Montana':                 'Монтана',
  'Beroe':                   'Берое',
  'Dobrudzha Dobrich':       'Добруджа Добрич',
}

export function teamNameBg(latinName: string): string {
  return TEAM_BG[latinName] ?? latinName
}
