import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Card, Field, Row, Status, Progress, BigResult, CalcButton, Toggle, UnitsGrid } from './Shared.jsx';
import { toGB, allUnits, fmt, calcDatastore, calcStatus } from '../utils/engine.js';

// ════════════════════════════════════════════
// SMART VALIDATION ENGINE
// ════════════════════════════════════════════
function runPreChecks(params) {
  var warnings = [];
  var errors = [];

  var usedGB = toGB(params.used.v, params.used.u);
  var ramGB = toGB(params.ram.v, params.ram.u);
  var snapGB = toGB(params.snap.v, params.snap.u);
  var dsCapGB = toGB(params.dsCap.v, params.dsCap.u);
  var curTotGB = toGB(params.curTot.v, params.curTot.u);
  var curFreeGB = toGB(params.curFree.v, params.curFree.u);
  var buffer = parseFloat(params.buf) || 0;

  // ── EMPTY FIELD CHECKS ──
  if (!params.used.v || parseFloat(params.used.v) <= 0) {
    errors.push({ field: 'used', msg: 'Used space is required and must be greater than 0' });
  }
  if (!params.ram.v || parseFloat(params.ram.v) < 0) {
    errors.push({ field: 'ram', msg: 'VM RAM is required' });
  }
  if (!params.snap.v || parseFloat(params.snap.v) < 0) {
    errors.push({ field: 'snap', msg: 'Snapshot overhead is required' });
  }
  if (!params.buf || buffer < 1) {
    errors.push({ field: 'buf', msg: 'Buffer must be at least 1.0' });
  }
  if (buffer > 2) {
    warnings.push('Buffer is ' + buffer + 'x — this is unusually high. VMware recommends 1.25x. Are you sure?');
  }

  // Stop further checks if there are errors
  if (errors.length > 0) return { errors: errors, warnings: warnings };

  // ── USED SPACE vs TOTAL CAPACITY LOGIC ──
  if (curTotGB > 0 && usedGB > curTotGB) {
    errors.push({ field: 'used', msg: 'Used space (' + fmt(usedGB) + ' GB) exceeds current total capacity (' + fmt(curTotGB) + ' GB). Check your values or units.' });
  }

  // ── FREE SPACE CHECKS ──
  if (curTotGB > 0 && curFreeGB > curTotGB) {
    errors.push({ field: 'curFree', msg: 'Free space (' + fmt(curFreeGB) + ' GB) cannot exceed total capacity (' + fmt(curTotGB) + ' GB)' });
  }

  if (curTotGB > 0 && curFreeGB > 0) {
    var computedUsed = curTotGB - curFreeGB;
    // Check if user-entered used space is close to computed used
    if (usedGB > 0 && Math.abs(usedGB - computedUsed) > computedUsed * 0.5 && computedUsed > 0) {
      warnings.push(
        'Used space you entered (' + fmt(usedGB) + ' GB) differs significantly from computed used space (' +
        fmt(computedUsed) + ' GB = Total ' + fmt(curTotGB) + ' GB - Free ' + fmt(curFreeGB) + ' GB). Double-check your inputs.'
      );
    }
  }

  // ── UNIT SANITY: Detect likely unit mistakes ──
  // e.g., user enters 500 in TB for used space — that's 500 TB which is enormous
  if (usedGB > 100000) {
    warnings.push('Used space converts to ' + fmt(usedGB) + ' GB (' + fmt(usedGB / 1024, 2) + ' TB). This is very large. Did you select the correct unit?');
  }

  // If used space is in GB but the number is very small (< 1 GB), maybe they meant MB
  if (params.used.u === 'GB' && parseFloat(params.used.v) > 0 && parseFloat(params.used.v) < 0.5) {
    warnings.push('Used space is ' + params.used.v + ' GB (less than 0.5 GB). Did you mean to use MB?');
  }

  // If RAM is in TB — unusual, most VMs have RAM in GB
  if (params.ram.u === 'TB' && parseFloat(params.ram.v) > 0) {
    warnings.push('VM RAM is set to ' + params.ram.v + ' TB. RAM is typically measured in GB. Did you select the correct unit?');
  }
  if (params.ram.u === 'PB') {
    errors.push({ field: 'ram', msg: 'VM RAM in PB is not realistic. Please check the unit.' });
  }

  // If RAM > used space — unusual
  if (ramGB > usedGB && usedGB > 0) {
    warnings.push('VM RAM (' + fmt(ramGB) + ' GB) exceeds used space (' + fmt(usedGB) + ' GB). This is uncommon — verify your values.');
  }

  // ── SNAPSHOT OVERHEAD vs CAPACITY ──
  if (dsCapGB > 0 && snapGB > dsCapGB * 0.5) {
    warnings.push('Snapshot overhead (' + fmt(snapGB) + ' GB) is more than 50% of datastore capacity (' + fmt(dsCapGB) + ' GB). The agreed standard is 10%.');
  }

  // ── USED SPACE vs DATASTORE CAPACITY ──
  if (dsCapGB > 0 && usedGB > dsCapGB) {
    warnings.push(
      'Used space (' + fmt(usedGB) + ' GB) exceeds the datastore total capacity (' + fmt(dsCapGB) + ' GB). ' +
      'This could indicate thin provisioning or a unit mismatch.'
    );
  }

  // ── CURRENT FREE + USED should roughly equal TOTAL ──
  if (curTotGB > 0 && curFreeGB > 0) {
    var sumCheck = curFreeGB + usedGB;
    if (sumCheck > curTotGB * 1.1) {
      warnings.push(
        'Used (' + fmt(usedGB) + ' GB) + Free (' + fmt(curFreeGB) + ' GB) = ' + fmt(sumCheck) + ' GB, ' +
        'which exceeds total capacity (' + fmt(curTotGB) + ' GB). Verify your inputs.'
      );
    }
  }

  // ── VERY SMALL VALUES ──
  if (usedGB > 0 && usedGB < 0.01) {
    warnings.push('Used space is extremely small (' + fmt(usedGB, 6) + ' GB). Check your unit selection.');
  }

  // ── NEGATIVE VALUES ──
  if (parseFloat(params.used.v) < 0) errors.push({ field: 'used', msg: 'Used space cannot be negative' });
  if (parseFloat(params.ram.v) < 0) errors.push({ field: 'ram', msg: 'RAM cannot be negative' });
  if (parseFloat(params.curFree.v) < 0) errors.push({ field: 'curFree', msg: 'Free space cannot be negative' });
  if (parseFloat(params.curTot.v) < 0) errors.push({ field: 'curTot', msg: 'Capacity cannot be negative' });

  // ── MEMORY SNAPSHOT DOUBLING CHECK ──
  if (params.memSnap && ramGB * 2 > usedGB && usedGB > 0) {
    warnings.push(
      'With memory snapshot enabled, effective RAM (' + fmt(ramGB * 2) + ' GB) exceeds used space (' +
      fmt(usedGB) + ' GB). This is unusual — confirm your RAM value.'
    );
  }

  return { errors: errors, warnings: warnings };
}

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════
function DatastoreTab() {
  var s1 = useState({ v: '', u: 'GB' }); var used = s1[0]; var setUsed = s1[1];
  var s2 = useState({ v: '', u: 'GB' }); var ram = s2[0]; var setRam = s2[1];
  var s3 = useState({ v: '', u: 'TB' }); var dsCap = s3[0]; var setDsCap = s3[1];
  var s4 = useState({ v: '', u: 'GB' }); var snap = s4[0]; var setSnap = s4[1];
  var s5 = useState('1.25'); var buf = s5[0]; var setBuf = s5[1];
  var s6 = useState({ v: '', u: 'TB' }); var curTot = s6[0]; var setCurTot = s6[1];
  var s7 = useState({ v: '', u: 'GB' }); var curFree = s7[0]; var setCurFree = s7[1];
  var s8 = useState(false); var memSnap = s8[0]; var setMemSnap = s8[1];
  var s9 = useState(null); var result = s9[0]; var setResult = s9[1];
  var s10 = useState(null); var status = s10[0]; var setStatus = s10[1];
  var s11 = useState({}); var fieldErrors = s11[0]; var setFieldErrors = s11[1];
  var s12 = useState(false); var exporting = s12[0]; var setExporting = s12[1];
  var s13 = useState([]); var liveWarnings = s13[0]; var setLiveWarnings = s13[1];

  // AUTO-UPDATE snapshot overhead
  useEffect(function () {
    var rawVal = parseFloat(dsCap.v);
    if (!rawVal || isNaN(rawVal) || rawVal <= 0) { setSnap({ v: '', u: 'GB' }); return; }
    var capGB = toGB(rawVal, dsCap.u);
    if (capGB > 0) {
      var tenPct = capGB * 0.10;
      if (tenPct >= 1024) setSnap({ v: (tenPct / 1024).toFixed(4), u: 'TB' });
      else if (tenPct < 0.001) setSnap({ v: (tenPct * 1024).toFixed(4), u: 'MB' });
      else setSnap({ v: tenPct.toFixed(4), u: 'GB' });
    }
  }, [dsCap.v, dsCap.u]);

  // LIVE PRE-CHECKS — run on every input change
  useEffect(function () {
    var hasAnyInput = used.v || ram.v || snap.v || curTot.v || curFree.v;
    if (!hasAnyInput) { setLiveWarnings([]); return; }

    var check = runPreChecks({
      used: used, ram: ram, snap: snap, dsCap: dsCap,
      curTot: curTot, curFree: curFree, buf: buf, memSnap: memSnap,
    });

    setLiveWarnings(check.warnings || []);
  }, [used.v, used.u, ram.v, ram.u, snap.v, snap.u, dsCap.v, dsCap.u, curTot.v, curTot.u, curFree.v, curFree.u, buf, memSnap]);

  var livePreview = useMemo(function () {
    var u = toGB(used.v, used.u);
    var r = toGB(ram.v, ram.u);
    var sn = toGB(snap.v, snap.u);
    var b = parseFloat(buf) || 1.25;
    if (u <= 0 && r <= 0 && sn <= 0) return null;
    var effR = memSnap ? r * 2 : r;
    return fmt((u + effR + sn) * b, 2) + ' GB';
  }, [used.v, used.u, ram.v, ram.u, snap.v, snap.u, buf, memSnap]);

  function calculate() {
    // Run full validation
    var check = runPreChecks({
      used: used, ram: ram, snap: snap, dsCap: dsCap,
      curTot: curTot, curFree: curFree, buf: buf, memSnap: memSnap,
    });

    // Set field-level errors
    var fErrs = {};
    check.errors.forEach(function (e) { if (e.field) fErrs[e.field] = e.msg; });
    setFieldErrors(fErrs);

    // Show errors
    if (check.errors.length > 0) {
      check.errors.forEach(function (e) { toast.error(e.msg); });
      return;
    }

    // Show warnings but allow proceeding
    if (check.warnings.length > 0) {
      check.warnings.forEach(function (w) {
        toast(w, {
          icon: '\u26A0\uFE0F',
          duration: 6000,
          style: {
            background: 'var(--bg-3)',
            color: 'var(--amber)',
            border: '1px solid var(--amber-border)',
            fontSize: '13px',
            maxWidth: '500px',
          },
        });
      });
    }

    var ds = calcDatastore({
      usedGB: toGB(used.v, used.u), ramGB: toGB(ram.v, ram.u),
      snapGB: toGB(snap.v, snap.u), buffer: parseFloat(buf) || 1.25, memSnap: memSnap,
    });
    setResult(ds);

    var ctGB = toGB(curTot.v, curTot.u);
    var cfGB = toGB(curFree.v, curFree.u);
    if (ctGB > 0) {
      setStatus(calcStatus(ctGB, cfGB, ds.required));
    } else { setStatus(null); }
    toast.success('Calculation complete!');
  }

  // THEME-AWARE EXPORT
  function exportReport() {
    if (!status || !result) { toast.error('Calculate first'); return; }
    setExporting(true);

    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    var units = allUnits(result.required);

    var canvas = document.createElement('canvas');
    var W = 1200; var H = 920;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    var C = isDark ? {
      bg: '#080B14', cardBg: '#0E1220', cardBg2: '#141929',
      border: '#1E2640', text0: '#FFFFFF', text1: '#F0F2FA', text2: '#B8C0D8', text3: '#7E89A8', text4: '#505870', barBg: '#1A2035',
    } : {
      bg: '#F4F5F7', cardBg: '#FFFFFF', cardBg2: '#F8F9FC',
      border: '#D8DCE5', text0: '#0F1118', text1: '#1A1E2E', text2: '#3A4058', text3: '#5A6278', text4: '#8890A5', barBg: '#E2E4EA',
    };
    var gold = '#C9A84C'; var maroon = '#6D1932';
    var sColors = { success: '#22C55E', warning: '#F59E0B', danger: '#EF4444' };
    var sc = sColors[status.sev] || C.text3;

    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

    var grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, maroon); grad.addColorStop(1, gold);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 6);

    ctx.fillStyle = C.cardBg; ctx.fillRect(0, 6, W, 94);
    ctx.fillStyle = C.border; ctx.fillRect(0, 99, W, 1);
    ctx.fillStyle = gold; ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
    ctx.fillText('VCapacity Assessment Report', 40, 52);
    ctx.fillStyle = C.text3; ctx.font = '15px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Generated: ' + new Date().toLocaleString(), 40, 82);
    ctx.textAlign = 'right'; ctx.fillStyle = C.text4; ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillText('QNB | Technology Operations | Cloud & Platform Services', W - 40, 52);
    ctx.fillText('VCapacity v1.0', W - 40, 74);
    ctx.textAlign = 'left';

    var sY = 120;
    ctx.fillStyle = sc + (isDark ? '15' : '10'); rr(ctx, 30, sY, W - 60, 115, 16); ctx.fill();
    ctx.strokeStyle = sc + (isDark ? '40' : '30'); ctx.lineWidth = 2; rr(ctx, 30, sY, W - 60, 115, 16); ctx.stroke();
    ctx.fillStyle = sc; ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif'; ctx.fillText('STATUS: ' + status.status, 55, sY + 42);
    ctx.fillStyle = C.text2; ctx.font = '15px "Segoe UI", Arial, sans-serif'; wt(ctx, status.msg, 55, sY + 70, W - 120, 22);

    var mY = 255; var mets = [
      { l: 'Free Space', v: status.freePct + '%', c: sc }, { l: 'Used Space', v: status.usedPct + '%', c: C.text1 },
      { l: 'Free', v: fmt(status.freeGB, 2) + ' GB', c: C.text1 }, { l: 'Total', v: fmt(status.totalGB, 2) + ' GB', c: C.text1 },
    ]; var mw = (W - 90) / 4;
    mets.forEach(function (m, i) {
      var x = 40 + i * (mw + 10);
      ctx.fillStyle = C.cardBg2; rr(ctx, x, mY, mw, 82, 12); ctx.fill();
      ctx.strokeStyle = C.border; ctx.lineWidth = 1; rr(ctx, x, mY, mw, 82, 12); ctx.stroke();
      ctx.fillStyle = C.text4; ctx.font = 'bold 11px "Segoe UI", Arial'; ctx.fillText(m.l.toUpperCase(), x + 16, mY + 28);
      ctx.fillStyle = m.c; ctx.font = 'bold 24px "Segoe UI", Arial'; ctx.fillText(m.v, x + 16, mY + 62);
    });

    var bY = 358; ctx.fillStyle = C.barBg; rr(ctx, 40, bY, W - 80, 14, 7); ctx.fill();
    var bW = ((W - 80) * Math.min(status.usedPct, 100)) / 100;
    if (bW > 0) { var bg2 = ctx.createLinearGradient(40, 0, 40 + bW, 0); bg2.addColorStop(0, sc === '#22C55E' ? '#059669' : sc === '#F59E0B' ? '#D97706' : '#DC2626'); bg2.addColorStop(1, sc); ctx.fillStyle = bg2; rr(ctx, 40, bY, bW, 14, 7); ctx.fill(); }

    var tY = 400; ctx.fillStyle = gold; ctx.font = 'bold 19px "Segoe UI", Arial'; ctx.fillText('Sizing Breakdown', 40, tY);
    var rows = [['Datastore Used', fmt(result.usedGB, 2) + ' GB'], ['VM RAM' + (result.memSnap ? ' x2' : ''), fmt(result.ramGB, 2) + ' GB'], ['Snapshot Overhead', fmt(result.snapGB, 2) + ' GB'], ['Raw Sum', fmt(result.raw, 2) + ' GB'], ['Buffer (+' + fmt(result.bufferPct, 0) + '%)', '+' + fmt(result.padding, 2) + ' GB']];
    rows.forEach(function (r, i) {
      var y = tY + 32 + i * 34;
      ctx.fillStyle = C.text2; ctx.font = '15px "Segoe UI", Arial'; ctx.fillText(r[0], 55, y);
      ctx.fillStyle = C.text0; ctx.font = 'bold 15px "JetBrains Mono", Consolas, monospace'; ctx.textAlign = 'right'; ctx.fillText(r[1], W / 2 - 30, y); ctx.textAlign = 'left';
    });

    var rY = tY + 210;
    ctx.fillStyle = maroon + (isDark ? '20' : '08'); rr(ctx, 40, rY, W - 80, 90, 14); ctx.fill();
    ctx.strokeStyle = gold + (isDark ? '35' : '25'); ctx.lineWidth = 1.5; rr(ctx, 40, rY, W - 80, 90, 14); ctx.stroke();
    ctx.fillStyle = C.text4; ctx.font = 'bold 11px "Segoe UI", Arial'; ctx.textAlign = 'center';
    ctx.fillText('REQUIRED DATASTORE CAPACITY', W / 2, rY + 26);
    ctx.fillStyle = gold; ctx.font = 'bold 34px "Segoe UI", Arial'; ctx.fillText(fmt(result.required, 2) + ' GB', W / 2, rY + 64);
    ctx.fillStyle = C.text3; ctx.font = '14px "Segoe UI", Arial'; ctx.fillText(fmt(units.TB, 4) + ' TB  |  ' + fmt(units.MB, 0) + ' MB', W / 2, rY + 84);
    ctx.textAlign = 'left';

    var dY = rY + 110; var decs = [
      { l: 'Snapshot Authorization', v: status.snap ? 'AUTHORIZED' : 'DENIED', c: status.snap ? '#22C55E' : '#EF4444' },
      { l: 'Capacity Expansion', v: status.sufficient ? 'NOT NEEDED' : 'REQUIRED (+' + fmt(status.gap, 2) + ' GB)', c: status.sufficient ? '#22C55E' : '#EF4444' },
    ]; var dw2 = (W - 90) / 2;
    decs.forEach(function (d, i) {
      var x = 40 + i * (dw2 + 10);
      ctx.fillStyle = d.c + (isDark ? '10' : '08'); rr(ctx, x, dY, dw2, 68, 12); ctx.fill();
      ctx.strokeStyle = d.c + (isDark ? '30' : '20'); ctx.lineWidth = 1; rr(ctx, x, dY, dw2, 68, 12); ctx.stroke();
      ctx.fillStyle = C.text4; ctx.font = 'bold 10px "Segoe UI", Arial'; ctx.fillText(d.l.toUpperCase(), x + 16, dY + 24);
      ctx.fillStyle = d.c; ctx.font = 'bold 18px "Segoe UI", Arial'; ctx.fillText(d.v, x + 16, dY + 52);
    });

    var fY = H - 65; ctx.fillStyle = C.cardBg; ctx.fillRect(0, fY, W, 65);
    var fG = ctx.createLinearGradient(0, fY, W, fY); fG.addColorStop(0, maroon); fG.addColorStop(1, gold);
    ctx.fillStyle = fG; ctx.fillRect(0, fY, W, 3);
    ctx.fillStyle = gold; ctx.font = 'bold 13px "Segoe UI", Arial'; ctx.fillText('QNB  |  Technology Operations  |  Cloud & Platform Services', 40, fY + 28);
    ctx.fillStyle = C.text4; ctx.font = '12px "Segoe UI", Arial'; ctx.fillText('VCapacity v1.0', 40, fY + 48);
    ctx.textAlign = 'right'; ctx.fillText(new Date().toLocaleString(), W - 40, fY + 28);
    ctx.fillStyle = maroon + (isDark ? '80' : '60'); ctx.font = 'bold 11px "Segoe UI", Arial';
    ctx.fillText('CONFIDENTIAL — INTERNAL USE ONLY', W - 40, fY + 48); ctx.textAlign = 'left';

    var link = document.createElement('a');
    link.download = 'Datastore-Assessment-' + (isDark ? 'Dark' : 'Light') + '-' + new Date().toISOString().slice(0, 10) + '.png';
    link.href = canvas.toDataURL('image/png'); link.click();
    toast.success('Report exported in ' + (isDark ? 'dark' : 'light') + ' mode!');
    setExporting(false);
  }

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
  function wt(ctx, text, x, y, mW, lH) { var w = text.split(' '); var l = ''; for (var i = 0; i < w.length; i++) { var t = l + w[i] + ' '; if (ctx.measureText(t).width > mW && i > 0) { ctx.fillText(l, x, y); l = w[i] + ' '; y += lH; } else l = t; } ctx.fillText(l, x, y); }

  var units = result ? allUnits(result.required) : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: '22px' }}>
      {/* INPUT */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <Card title="Datastore Used Space" sub="Total consumed storage across all VMs on this datastore" accent="var(--qnb-primary)" delay={0}>
          <Field label="Total Used Space" num="1" hint="vCenter > Storage > Datastores > [DS] > Summary > Used"
            value={used.v} onChange={function (v) { setUsed({ v: v, u: used.u }); setFieldErrors({}); }}
            unit={used.u} onUnit={function (u) { setUsed({ v: used.v, u: u }); }} error={fieldErrors.used}
          />
        </Card>

        <Card title="VM RAM — Swap Files" sub="Sum of configured VM RAM for all VMs on this datastore" accent="var(--blue)" delay={0.05}>
          <Field label="Total VM RAM" num="2" hint="vCenter > VMs > Edit Settings > Memory"
            value={ram.v} onChange={function (v) { setRam({ v: v, u: ram.u }); setFieldErrors({}); }}
            unit={ram.u} onUnit={function (u) { setRam({ v: ram.v, u: u }); }} error={fieldErrors.ram}
          />
          <div style={{ marginTop: '12px' }}>
            <Toggle checked={memSnap} onChange={setMemSnap} label="Include Memory Snapshot"
              sub={memSnap ? 'RAM value will be doubled (swap + memory dump)' : 'Enable if snapshots will capture VM memory state'} />
          </div>
        </Card>

        <Card title="Snapshot Overhead" sub="Automatically calculated at 10% of datastore capacity as you type" accent="var(--amber)" delay={0.1}>
          <Field label="Datastore Total Capacity" num="3A" hint="Enter capacity — overhead auto-calculates below"
            value={dsCap.v} onChange={function (v) { setDsCap({ v: v, u: dsCap.u }); }}
            unit={dsCap.u} onUnit={function (u) { setDsCap({ v: dsCap.v, u: u }); }}
          />
          {toGB(parseFloat(dsCap.v) || 0, dsCap.u) > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ padding: '10px 16px', borderRadius: '12px', fontSize: '14px', marginBottom: '14px', background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-border)', fontWeight: 600 }}
            >
              10% overhead = <strong>{fmt(toGB(parseFloat(dsCap.v) || 0, dsCap.u) * 0.10, 4)} GB</strong>
              <span style={{ opacity: 0.6, marginLeft: '10px' }}>({fmt(toGB(parseFloat(dsCap.v) || 0, dsCap.u) * 0.10 / 1024, 4)} TB)</span>
            </motion.div>
          )}
          <Field label="Snapshot Overhead Value (auto-filled)" num="3B"
            value={snap.v} onChange={function (v) { setSnap({ v: v, u: snap.u }); setFieldErrors({}); }}
            unit={snap.u} onUnit={function (u) { setSnap({ v: snap.v, u: u }); }} error={fieldErrors.snap}
          />
        </Card>

        <Card title="Safety & Current Status" sub="Buffer and current datastore metrics for health check" accent="var(--qnb-gold)" delay={0.15}>
          <Field label="Safety Buffer" num="4" hint="VMware recommended: 1.25 (maintains ~20-25% free space)"
            value={buf} onChange={function (v) { setBuf(v); setFieldErrors({}); }}
            showUnit={false} suffix="x multiplier" step="0.05" error={fieldErrors.buf}
          />
          <div style={{ height: '1px', margin: '16px 0', background: 'var(--border-1)' }} />
          <Field label="Current Capacity" num="5A" hint="vCenter > Summary > Capacity"
            value={curTot.v} onChange={function (v) { setCurTot({ v: v, u: curTot.u }); }}
            unit={curTot.u} onUnit={function (u) { setCurTot({ v: curTot.v, u: u }); }} error={fieldErrors.curTot}
          />
          <Field label="Current Free Space" num="5B"
            value={curFree.v} onChange={function (v) { setCurFree({ v: v, u: curFree.u }); }}
            unit={curFree.u} onUnit={function (u) { setCurFree({ v: curFree.v, u: u }); }} error={fieldErrors.curFree}
          />

          {/* LIVE WARNINGS */}
          <AnimatePresence>
            {liveWarnings.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ marginTop: '10px', marginBottom: '6px' }}
              >
                {liveWarnings.map(function (w, i) {
                  return (
                    <motion.div key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      style={{
                        padding: '10px 14px', borderRadius: '10px', marginBottom: '6px',
                        fontSize: '13px', lineHeight: 1.6, fontWeight: 500,
                        background: 'var(--amber-bg)', color: 'var(--amber)',
                        border: '1px solid var(--amber-border)',
                        display: 'flex', alignItems: 'flex-start', gap: '8px',
                      }}
                    >
                      <span style={{ flexShrink: 0, fontSize: '14px', marginTop: '1px' }}>{'\u26A0'}</span>
                      <span>{w}</span>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {livePreview && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ padding: '14px 16px', borderRadius: '12px', marginTop: '8px', marginBottom: '8px', background: 'rgba(109,25,50,0.07)', border: '1px solid rgba(109,25,50,0.18)', textAlign: 'center' }}
            >
              <span style={{ fontSize: '14px', color: 'var(--text-body)' }}>Live estimate: </span>
              <span className="shimmer-gold" style={{ fontSize: '20px', fontWeight: 800 }}>{livePreview}</span>
            </motion.div>
          )}
          <CalcButton onClick={calculate} label="CALCULATE REQUIRED CAPACITY" />
        </Card>
      </div>

      {/* RESULTS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div key="ph" exit={{ opacity: 0, scale: 0.95 }}>
              <Card delay={0.1}>
                <div style={{ textAlign: 'center', padding: '70px 20px' }}>
                  <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ fontSize: '56px', marginBottom: '18px', opacity: 0.12 }}>{'\u25C6'}</motion.div>
                  <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-3)' }}>Awaiting Calculation</p>
                  <p style={{ fontSize: '14px', color: 'var(--text-body)', marginTop: '8px' }}>Fill in the inputs and click calculate</p>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div key="res" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <Card title="Capacity Sizing Breakdown" sub="Formula: (Used + RAM + Snapshot) x Safety Buffer" accent="var(--green)" delay={0}>
                <Row label="Datastore Used" value={fmt(result.usedGB) + ' GB'} />
                <Row label={'VM RAM' + (result.memSnap ? ' (x2 Memory)' : '')} value={fmt(result.ramGB) + ' GB'} gold={result.memSnap} />
                {result.memSnap && (
                  <div style={{ padding: '8px 14px', margin: '4px 0 4px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: 'rgba(109,25,50,0.07)', color: 'var(--qnb-gold)' }}>
                    Original: {fmt(result.origRamGB)} GB {'\u2192'} Doubled for memory snapshot
                  </div>
                )}
                <Row label="Snapshot Overhead" value={fmt(result.snapGB) + ' GB'} />
                <Row label="Raw Sum" value={fmt(result.raw) + ' GB'} />
                <Row label={'Buffer (+' + fmt(result.bufferPct, 0) + '%)'} value={'+' + fmt(result.padding) + ' GB'} />
                <BigResult label="Required Datastore Capacity" value={fmt(result.required, 2) + ' GB'} sub={fmt(units.TB, 4) + ' TB  \u00B7  ' + fmt(units.MB, 0) + ' MB'} />
                <UnitsGrid units={units} />
              </Card>

              {status && (
                <Card title="Health Assessment" sub="Automated evaluation for Storage, Database & Operations teams"
                  accent={status.sev === 'success' ? 'var(--green)' : status.sev === 'warning' ? 'var(--amber)' : 'var(--red)'}
                  glow={status.sev === 'danger' ? 'rgba(239,68,68,0.05)' : status.sev === 'warning' ? 'rgba(245,158,11,0.04)' : 'rgba(34,197,94,0.03)'}
                  delay={0.08}
                >
                  <Status sev={status.sev} title={'STATUS: ' + status.status} detail={status.msg} />
                  <Progress pct={status.usedPct} sev={status.sev}
                    left={'Used: ' + fmt(status.usedGB, 2) + ' GB (' + status.usedPct + '%)'}
                    right={'Free: ' + fmt(status.freeGB, 2) + ' GB (' + status.freePct + '%)'}
                  />
                  <div style={{ marginTop: '18px' }}>
                    <SL text="Snapshot Authorization" />
                    <Status sev={status.snap ? 'success' : 'danger'}
                      title={status.snap ? 'AUTHORIZED \u2014 Safe to proceed' : 'DENIED \u2014 Insufficient margin'}
                      detail={status.snap ? 'Free space meets minimum threshold. Snapshots may proceed per change management protocols.' : 'Contact Storage Team for capacity planning before any snapshot operations.'}
                    />
                  </div>
                  <div style={{ marginTop: '18px' }}>
                    <SL text="Expansion Assessment" />
                    {status.sufficient ? (
                      <Status sev="success" title="NO EXPANSION NEEDED" detail={'Current capacity of ' + fmt(status.totalGB, 2) + ' GB meets the requirement of ' + fmt(result.required, 2) + ' GB.'} />
                    ) : (
                      <React.Fragment>
                        <Status sev="danger" title="EXPANSION REQUIRED" />
                        <BigResult danger label="Required Expansion" value={'+' + fmt(status.gap, 2) + ' GB'} sub={fmt(status.gap / 1024, 4) + ' TB additional capacity needed'} />
                      </React.Fragment>
                    )}
                  </div>
                  <SummaryBox status={status} />

                  <motion.button whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
                    onClick={exportReport} disabled={exporting}
                    style={{
                      width: '100%', padding: '16px', borderRadius: '14px', marginTop: '22px',
                      cursor: exporting ? 'wait' : 'pointer', border: '1.5px solid rgba(201,168,76,0.3)',
                      fontSize: '15px', fontWeight: 800, letterSpacing: '1px',
                      background: 'linear-gradient(135deg, rgba(201,168,76,0.12), rgba(109,25,50,0.08))',
                      color: 'var(--qnb-gold)', boxShadow: '0 4px 20px rgba(201,168,76,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {exporting ? 'GENERATING...' : 'EXPORT ASSESSMENT REPORT'}
                  </motion.button>

                  <div style={{
                    marginTop: '16px', padding: '16px 20px', borderRadius: '14px',
                    background: 'linear-gradient(135deg, rgba(109,25,50,0.06), rgba(201,168,76,0.04))',
                    border: '1px solid rgba(201,168,76,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
                  }}>
                    <div>
                      <p style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--qnb-gold)', marginBottom: '4px' }}>QNB &middot; Technology Operations</p>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-body)' }}>Cloud & Platform Services Team</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-4)' }}>VCapacity v1.0</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-4)' }}>Confidential — Internal Use</p>
                    </div>
                  </div>
                </Card>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SL(props) {
  return <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: '10px' }}>{props.text}</div>;
}

function SummaryBox(props) {
  var st = props.status; if (!st) return null;
  var items = [
    { l: 'Status', v: st.status, s: st.sev },
    { l: 'Free Space', v: st.freePct + '%', s: st.sev },
    { l: 'Snapshot', v: st.snap ? 'Authorized' : 'Denied', s: st.snap ? 'success' : 'danger' },
    { l: 'Expansion', v: st.sufficient ? 'Not needed' : '+' + fmt(st.gap, 2) + ' GB', s: st.sufficient ? 'success' : 'danger' },
  ];
  var c = { success: 'var(--green)', warning: 'var(--amber)', danger: 'var(--red)' };
  return (
    <div style={{ marginTop: '22px', padding: '18px', borderRadius: '14px', background: 'var(--bg-input)', border: '1px solid var(--border-1)' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--qnb-gold)', marginBottom: '12px' }}>CROSS-TEAM SUMMARY</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
        {items.map(function (item) {
          return (
            <div key={item.l} style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-1)' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: '4px' }}>{item.l}</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: c[item.s] || 'var(--text-1)' }}>{item.v}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DatastoreTab;