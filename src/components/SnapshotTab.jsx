import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Card, Field, Row, BigResult, CalcButton, Toggle, UnitsGrid } from './Shared.jsx';
import { toGB, allUnits, fmt, calcDWR, calcSnapshot } from '../utils/engine.js';

function SnapshotTab() {
  var s1 = useState(1); var method = s1[0]; var setMethod = s1[1];
  var s2 = useState(''); var kbps = s2[0]; var setKbps = s2[1];
  var s3 = useState({ v: '', u: 'GB' }); var bkup = s3[0]; var setBkup = s3[1];
  var s4 = useState('7'); var days = s4[0]; var setDays = s4[1];
  var s5 = useState('1.2'); var sf = s5[0]; var setSf = s5[1];
  var s6 = useState(false); var mem = s6[0]; var setMem = s6[1];
  var s7 = useState({ v: '', u: 'GB' }); var mRam = s7[0]; var setMRam = s7[1];
  var s8 = useState(null); var result = s8[0]; var setResult = s8[1];
  var s9 = useState({}); var errs = s9[0]; var setErrs = s9[1];

  var dwrLive = useMemo(function () {
    if (method !== 1) return null;
    var v = calcDWR(kbps);
    return v > 0 ? v : null;
  }, [kbps, method]);

  var livePrev = useMemo(function () {
    var dwr = method === 1 ? calcDWR(kbps) : toGB(bkup.v, bkup.u);
    var d = parseInt(days) || 7;
    var s = parseFloat(sf) || 1.2;
    if (dwr <= 0) return null;
    var total = dwr * d * s;
    if (mem) {
      total += toGB(mRam.v, mRam.u) + 100 / 1024;
    }
    return fmt(total, 4) + ' GB';
  }, [method, kbps, bkup.v, bkup.u, days, sf, mem, mRam.v, mRam.u]);

  function validate() {
    var e = {};
    if (method === 1 && (!kbps || parseFloat(kbps) <= 0)) e.kbps = 'Required';
    if (method === 2 && (!bkup.v || parseFloat(bkup.v) <= 0)) e.bkup = 'Required';
    if (!days || parseInt(days) < 1) e.days = 'Min 1';
    if (!sf || parseFloat(sf) < 1) e.sf = 'Min 1.0';
    if (mem && (!mRam.v || parseFloat(mRam.v) <= 0)) e.mRam = 'Required';
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  function calculate() {
    if (!validate()) { toast.error('Please complete all required fields'); return; }
    var dwr = method === 1 ? calcDWR(kbps) : toGB(bkup.v, bkup.u);
    setResult(calcSnapshot({
      dwr: dwr, days: parseInt(days) || 7, sf: parseFloat(sf) || 1.2,
      mem: mem, ramGB: mem ? toGB(mRam.v, mRam.u) : 0,
    }));
    toast.success('Snapshot sizing complete!');
  }

  var units = result ? allUnits(result.total) : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: '22px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <Card title="Daily Write Rate" sub="Estimate data change rate" accent="var(--blue)" delay={0}>
          <div className="flex" style={{ gap: '8px', marginBottom: '16px' }}>
            {[{ id: 1, l: 'Throughput (KB/s)' }, { id: 2, l: 'Backup Size' }].map(function (m) {
              var a = method === m.id;
              return (
                <motion.button key={m.id} whileTap={{ scale: 0.97 }}
                  onClick={function () { setMethod(m.id); setErrs({}); }}
                  style={{
                    flex: 1, padding: '12px', borderRadius: '12px',
                    border: '1.5px solid ' + (a ? 'var(--qnb-primary)' : 'var(--border-1)'),
                    fontSize: '13px', fontWeight: a ? 700 : 500, cursor: 'pointer',
                    background: a ? 'rgba(109,25,50,0.1)' : 'var(--bg-input)',
                    color: a ? 'var(--qnb-gold)' : 'var(--text-4)', transition: 'all 0.2s',
                  }}
                >{m.l}</motion.button>
              );
            })}
          </div>

          {method === 1 ? (
            <React.Fragment>
              <Field label="Avg Disk Write Throughput"
                hint="vCenter > Performance > Disk Write Rate (KBps) > 7-day avg"
                value={kbps} onChange={function (v) { setKbps(v); setErrs({}); }}
                showUnit={false} suffix="KB/s" error={errs.kbps}
              />
              {dwrLive && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ padding: '10px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-border)' }}
                >
                  Daily Write Rate: <strong>{fmt(dwrLive, 4)} GB/day</strong> ({fmt(dwrLive * 1024, 2)} MB/day)
                </motion.div>
              )}
            </React.Fragment>
          ) : (
            <Field label="Incremental Backup Size"
              hint="From Veeam / Commvault — last incremental job size"
              value={bkup.v} onChange={function (v) { setBkup({ v: v, u: bkup.u }); setErrs({}); }}
              unit={bkup.u} onUnit={function (u) { setBkup({ v: bkup.v, u: u }); }}
              error={errs.bkup}
            />
          )}
        </Card>

        <Card title="Retention & Safety" accent="var(--amber)" delay={0.05}>
          <Field label="Retention Period" num="2" value={days} onChange={function (v) { setDays(v); setErrs({}); }} showUnit={false} suffix="days" step="1" error={errs.days} />
          <Field label="Safety Factor" num="3" hint="1.2 = 20% buffer for spikes" value={sf} onChange={function (v) { setSf(v); setErrs({}); }} showUnit={false} suffix="x" step="0.1" error={errs.sf} />
        </Card>

        <Card title="Memory State" sub="Optional VM memory capture (.vmsn)" accent="var(--purple)" delay={0.1}>
          <Toggle checked={mem} onChange={setMem} label="Include Memory Snapshot" sub={mem ? 'Adds RAM + ~100MB overhead' : 'Creates .vmsn with RAM dump'} />
          <AnimatePresence>
            {mem && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ marginTop: '12px' }}>
                <Field label="VM RAM" hint="Memory State = RAM + ~100 MB"
                  value={mRam.v} onChange={function (v) { setMRam({ v: v, u: mRam.u }); setErrs({}); }}
                  unit={mRam.u} onUnit={function (u) { setMRam({ v: mRam.v, u: u }); }}
                  error={errs.mRam}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {livePrev && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ padding: '12px 16px', borderRadius: '12px', marginTop: '10px', textAlign: 'center', background: 'rgba(109,25,50,0.07)', border: '1px solid rgba(109,25,50,0.18)' }}
            >
              <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>Live estimate: </span>
              <span className="shimmer-gold" style={{ fontSize: '17px', fontWeight: 800 }}>{livePrev}</span>
            </motion.div>
          )}
          <CalcButton onClick={calculate} label="CALCULATE SNAPSHOT SIZING" />
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div key="ph" exit={{ opacity: 0 }}>
              <Card delay={0.1}>
                <div style={{ textAlign: 'center', padding: '70px 20px' }}>
                  <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }} style={{ fontSize: '56px', opacity: 0.12, marginBottom: '18px' }}>{'\u25C7'}</motion.div>
                  <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-3)' }}>Awaiting Calculation</p>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <Card title="Snapshot Sizing Results" sub="Total = Delta + Memory State" accent="var(--green)" delay={0}>
                <Row label="Daily Write Rate" value={fmt(result.dwr, 4) + ' GB/day'} />
                <Row label="Retention" value={result.days + ' days'} />
                <Row label="Safety Factor" value={'x' + result.sf} />
                <Row label="Data Delta" value={fmt(result.delta, 4) + ' GB'} gold />
                <Row label="Memory State" value={result.mem ? fmt(result.memSize, 4) + ' GB' : 'Not included'} />
                <BigResult label="Total Snapshot Size" value={fmt(result.total, 4) + ' GB'} sub={fmt(units.TB, 6) + ' TB  ·  ' + fmt(units.MB, 2) + ' MB'} />
                <UnitsGrid units={units} />
              </Card>

              <Card title="Formula Walkthrough" accent="var(--blue)" delay={0.05}>
                <pre style={{
                  fontSize: '13px', lineHeight: 1.9, padding: '18px', borderRadius: '14px', overflowX: 'auto',
                  background: 'var(--bg-input)', border: '1px solid var(--border-1)', color: 'var(--text-3)',
                  fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
{`Data Delta:
  = ${fmt(result.dwr, 4)} GB/day x ${result.days} days x ${result.sf}
  = ${fmt(result.delta, 4)} GB

Memory State:
  ${result.mem ? '= ' + fmt(result.memSize, 4) + ' GB (RAM + ~100MB)' : '= Not included'}

Total = ${fmt(result.delta, 4)} + ${fmt(result.memSize, 4)}
      = ${fmt(result.total, 4)} GB (${fmt(units.TB, 6)} TB)`}
                </pre>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default SnapshotTab;