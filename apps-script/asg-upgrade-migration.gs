// Editor-only migration. Do not add this file to a deployed version.
// Make a workbook copy first; pause player edits and direct HQ Upgrades edits.
function asgUpgradeMigrationDryRun() { asgUpgradeMigration_(false); }
function asgUpgradeMigrationApply() { asgUpgradeMigration_(true); }
function asgUpgradeMigration_(apply) {
  var props = PropertiesService.getScriptProperties();
  var owner = str(props.getProperty('ASG_OWNER_EMAIL')).trim().toLowerCase();
  if (!owner || str(Session.getActiveUser().getEmail()).toLowerCase() !== owner ||
      str(Session.getEffectiveUser().getEmail()).toLowerCase() !== owner) throw new Error('Run as the configured script owner in the editor');
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ss = openAsgWorkbook_(props.getProperty('ASG_SHEET_ID'));
    var sh = sheetByName(ss, TAB.upgrades);
    var header = sh.getRange(1, 1, 1, 5).getValues()[0];
    if (header.slice(0, 3).join('|') !== 'category|name|note' ||
        (header[3] && header[3] !== 'id') || (header[4] && header[4] !== 'position')) throw new Error('Unexpected HQ Upgrades headers; no changes made');
    var rows = readTab(ss, TAB.upgrades, 5), seen = Object.create(null), counters = Object.create(null), planned = [];
    HQ_CATEGORIES.forEach(function (cat) { counters[cat] = 0; });
    rows.forEach(function (r, index) {
      if (!r.some(function (v) { return v !== ''; })) { planned.push(['', '']); return; }
      var cat = str(r[0]);
      if (HQ_CATEGORIES.indexOf(cat) < 0) throw new Error('Unknown category at row ' + (index + 2) + '; no changes made');
      var id = str(r[3]) || ('upg-' + Utilities.getUuid());
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || seen[id]) throw new Error('Invalid or duplicate ID at row ' + (index + 2) + '; no changes made');
      seen[id] = true;
      var pos = r[4] === '' ? counters[cat] : r[4];
      if (typeof pos !== 'number' || !isFinite(pos) || pos < 0 || Math.floor(pos) !== pos) throw new Error('Invalid order at row ' + (index + 2) + '; no changes made');
      counters[cat] = Math.max(counters[cat], pos + 1); planned.push([id, pos]);
    });
    if (!apply) { console.log('DRY RUN OK: ' + Object.keys(seen).length + ' upgrades. Only D:E headers and ID/order cells would be filled. A:C untouched. No writes made.'); return; }
    sh.getRange(1, 4, 1, 2).setValues([['id', 'position']]);
    if (planned.length) sh.getRange(2, 4, planned.length, 2).setValues(planned);
    ss.flush();
    console.log('MIGRATION APPLIED: ' + Object.keys(seen).length + ' upgrades. A:C untouched. Verify D:E and existing data before deployment.');
  } finally { lock.releaseLock(); }
}
