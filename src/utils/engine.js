var K = 1024;

var MULTIPLIER = {
  KB: 1,
  MB: K,
  GB: K * K,
  TB: K * K * K,
  PB: K * K * K * K,
};

export function toGB(value, unit) {
  var v = parseFloat(value);
  if (!v || isNaN(v) || v < 0) return 0;
  var m = MULTIPLIER[unit];
  if (!m) return v;
  return (v * m) / MULTIPLIER.GB;
}

export function fromGB(gb, unit) {
  if (!gb || isNaN(gb)) return 0;
  var m = MULTIPLIER[unit];
  if (!m) return gb;
  return (gb * MULTIPLIER.GB) / m;
}

export function allUnits(gb) {
  return {
    PB: fromGB(gb, 'PB'),
    TB: fromGB(gb, 'TB'),
    GB: gb,
    MB: fromGB(gb, 'MB'),
    KB: fromGB(gb, 'KB'),
  };
}

export function fmt(v, d) {
  if (d === undefined) d = 2;
  if (v === null || v === undefined || isNaN(v)) return '--';
  if (v === 0) return '0';
  var abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (abs >= 1e4) return v.toLocaleString('en-US', { maximumFractionDigits: d });
  if (abs >= 100) return (+v.toFixed(Math.min(d, 2))).toString();
  if (abs >= 1) return (+v.toFixed(d)).toString();
  if (abs >= 0.001) return (+v.toFixed(Math.max(d, 4))).toString();
  return v.toExponential(2);
}

export function smartUnit(gb) {
  if (gb <= 0) return '0 GB';
  if (gb >= K) return fmt(gb / K, 3) + ' TB';
  if (gb >= 1) return fmt(gb, 2) + ' GB';
  if (gb >= 1 / K) return fmt(gb * K, 2) + ' MB';
  return fmt(gb * K * K, 0) + ' KB';
}

export function calcDatastore(params) {
  var usedGB = params.usedGB || 0;
  var ramGB = params.ramGB || 0;
  var snapGB = params.snapGB || 0;
  var buffer = params.buffer || 1.25;
  var memSnap = params.memSnap || false;

  var effRam = memSnap ? ramGB * 2 : ramGB;
  var raw = usedGB + effRam + snapGB;
  var required = raw * buffer;
  var padding = required - raw;

  return {
    usedGB: usedGB,
    ramGB: effRam,
    origRamGB: ramGB,
    snapGB: snapGB,
    raw: raw,
    required: required,
    padding: padding,
    bufferPct: (buffer - 1) * 100,
    memSnap: memSnap,
  };
}

export function calcStatus(totalGB, freeGB, requiredGB) {
  if (totalGB <= 0) return null;
  var used = totalGB - freeGB;
  var freePct = (freeGB / totalGB) * 100;
  var usedPct = (used / totalGB) * 100;
  var gap = requiredGB - totalGB;

  var sev, status, msg, snap;

  if (freePct >= 25) {
    sev = 'success';
    status = 'APPROVED';
    msg = 'Datastore free space is ' + freePct.toFixed(1) + '% — meets the VMware recommended threshold (>=25%). Snapshot operations are safe to proceed.';
    snap = true;
  } else if (freePct >= 15) {
    sev = 'warning';
    status = 'WARNING';
    msg = 'Datastore free space is ' + freePct.toFixed(1) + '% — below the 25% recommendation. Elevated risk for snapshot operations. Coordinate with Storage Team.';
    snap = false;
  } else {
    sev = 'danger';
    status = 'CRITICAL';
    msg = 'CRITICAL: Free space at ' + freePct.toFixed(1) + '%. DO NOT perform snapshot operations. Immediate capacity expansion required.';
    snap = false;
  }

  return {
    totalGB: totalGB,
    freeGB: freeGB,
    usedGB: used,
    freePct: +freePct.toFixed(1),
    usedPct: +usedPct.toFixed(1),
    sev: sev,
    status: status,
    msg: msg,
    snap: snap,
    sufficient: totalGB >= requiredGB,
    gap: totalGB >= requiredGB ? 0 : +gap.toFixed(2),
  };
}

export function calcDWR(kbps) {
  return (parseFloat(kbps) || 0) * 0.0824;
}

export function calcSnapshot(params) {
  var dwr = params.dwr || 0;
  var days = params.days || 7;
  var sf = params.sf || 1.2;
  var mem = params.mem || false;
  var ramGB = params.ramGB || 0;

  var delta = dwr * days * sf;
  var memSize = mem ? ramGB + 100 / K : 0;
  var total = delta + memSize;

  return {
    dwr: dwr,
    days: days,
    sf: sf,
    delta: delta,
    memSize: memSize,
    total: total,
    mem: mem,
  };
}