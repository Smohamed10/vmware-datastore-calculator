// ═══════════════════════════════════════════════════════════
//  UNIT CONVERSION ENGINE
// ═══════════════════════════════════════════════════════════
const UNIT_TO_KB = {
  KB: 1,
  MB: 1024,
  GB: 1024 ** 2,
  TB: 1024 ** 3,
  PB: 1024 ** 4,
};

export function toGB(value, unit) {
  const kb = value * (UNIT_TO_KB[unit] || UNIT_TO_KB.GB);
  return kb / UNIT_TO_KB.GB;
}

export function fromGB(gb, targetUnit) {
  const kb = gb * UNIT_TO_KB.GB;
  return kb / (UNIT_TO_KB[targetUnit] || UNIT_TO_KB.GB);
}

export function getAllUnits(gb) {
  return {
    KB: fromGB(gb, 'KB'),
    MB: fromGB(gb, 'MB'),
    GB: gb,
    TB: fromGB(gb, 'TB'),
    PB: fromGB(gb, 'PB'),
  };
}

export function formatNumber(value, decimals = 4) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  if (value === 0) return '0';
  if (Math.abs(value) >= 10000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (Math.abs(value) >= 100) {
    return (+value.toFixed(2)).toString();
  }
  return (+value.toFixed(decimals)).toString();
}

export function smartFormat(gb) {
  if (gb >= 1024) return `${formatNumber(gb / 1024, 3)} TB`;
  if (gb >= 1) return `${formatNumber(gb, 2)} GB`;
  if (gb >= 1 / 1024) return `${formatNumber(gb * 1024, 2)} MB`;
  return `${formatNumber(gb * 1024 * 1024, 2)} KB`;
}

// ═══════════════════════════════════════════════════════════
//  DATASTORE SIZING CALCULATOR
// ═══════════════════════════════════════════════════════════
export function calculateDatastoreSizing({
  usedSpaceGB,
  ramGB,
  snapshotOverheadGB,
  safetyBuffer = 1.25,
  includeMemorySnapshot = false,
}) {
  const effectiveRamGB = includeMemorySnapshot ? ramGB * 2 : ramGB;
  const rawSum = usedSpaceGB + effectiveRamGB + snapshotOverheadGB;
  const requiredSize = rawSum * safetyBuffer;
  const bufferPadding = requiredSize - rawSum;

  return {
    usedSpace: usedSpaceGB,
    ram: effectiveRamGB,
    originalRam: ramGB,
    snapshotOverhead: snapshotOverheadGB,
    rawSum,
    requiredSize,
    bufferPadding,
    bufferPercentage: ((safetyBuffer - 1) * 100),
    includeMemorySnapshot,
  };
}

// ═══════════════════════════════════════════════════════════
//  DATASTORE STATUS ENGINE
// ═══════════════════════════════════════════════════════════
export function getDatastoreStatus(totalCapacityGB, freeSpaceGB, requiredSizeGB) {
  if (totalCapacityGB <= 0) return null;

  const usedSpace = totalCapacityGB - freeSpaceGB;
  const freePercent = (freeSpaceGB / totalCapacityGB) * 100;
  const usedPercent = (usedSpace / totalCapacityGB) * 100;
  const additionalNeeded = requiredSizeGB - totalCapacityGB;

  let status, detail, canSnapshot, severity;

  if (freePercent >= 25) {
    status = 'APPROVED';
    severity = 'success';
    detail = `Datastore free space is ${freePercent.toFixed(1)}%, which meets the VMware recommended threshold of ≥25%. Performance headroom is adequate and snapshot operations can be safely accommodated.`;
    canSnapshot = true;
  } else if (freePercent >= 15) {
    status = 'WARNING';
    severity = 'warning';
    detail = `Datastore free space is ${freePercent.toFixed(1)}%, which is below the recommended 25% threshold. Snapshot operations carry elevated risk. Coordinate with the Storage Team before proceeding.`;
    canSnapshot = false;
  } else {
    status = 'CRITICAL';
    severity = 'danger';
    detail = `CRITICAL: Datastore free space is only ${freePercent.toFixed(1)}%. Snapshot operations must NOT be performed. Immediate action required — coordinate with Storage Team for emergency capacity expansion.`;
    canSnapshot = false;
  }

  const capacitySufficient = totalCapacityGB >= requiredSizeGB;

  return {
    totalCapacity: totalCapacityGB,
    freeSpace: freeSpaceGB,
    usedSpace,
    freePercent: +freePercent.toFixed(2),
    usedPercent: +usedPercent.toFixed(2),
    status,
    severity,
    detail,
    canSnapshot,
    capacitySufficient,
    additionalNeeded: capacitySufficient ? 0 : +additionalNeeded.toFixed(2),
  };
}

// ═══════════════════════════════════════════════════════════
//  SNAPSHOT SIZING CALCULATOR
// ═══════════════════════════════════════════════════════════
export function calculateDailyWriteRate(avgThroughputKBs) {
  return avgThroughputKBs * 0.0824;
}

export function calculateSnapshotSizing({
  dailyWriteRateGB,
  retentionDays,
  safetyFactor = 1.2,
  includeMemory = false,
  vmRamGB = 0,
}) {
  const dataDeltaSize = dailyWriteRateGB * retentionDays * safetyFactor;
  const memoryStateSize = includeMemory ? vmRamGB + (100 / 1024) : 0;
  const totalSnapshot = dataDeltaSize + memoryStateSize;

  return {
    dailyWriteRate: dailyWriteRateGB,
    retentionDays,
    safetyFactor,
    dataDeltaSize,
    memoryStateSize,
    totalSnapshot,
    includeMemory,
  };
}