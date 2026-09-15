/**
 * Integration test: builds a realistic RVTools-shaped workbook in memory
 * (vDatastore / vInfo / vDisk with the headers RVTools actually emits),
 * round-trips it through a real .xlsx buffer, and verifies the whole
 * ingestion path end to end.
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { assessRows, datastoreFromVmdkPath, inventoryToRows, parseRVInventory, type RVInventory } from "../bulk";
import { rosterForDatastore } from "../planner";

async function buildRVToolsWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();

  const vds = wb.addWorksheet("vDatastore");
  vds.addRow([
    "Name", "Config status", "Type", "Capacity MiB", "Provisioned MiB",
    "In Use MiB", "Free MiB", "Free %", "Datastore Cluster Name",
  ]);
  vds.addRow(["DS-PROD-01", "green", "VMFS", 2097152, 1572864, 1048064, 1049088, 50.027, "POD-PROD"]);
  vds.addRow(["DS-PROD-02", "green", "NFS", "1,048,576", 786432, 524288, 524288, 50, "POD-PROD"]);

  const vi = wb.addWorksheet("vInfo");
  vi.addRow(["VM", "Powerstate", "Template", "CPUs", "Memory", "Provisioned MiB", "In Use MiB"]);
  vi.addRow(["WEB-01", "poweredOn", "false", 4, 32768, 327680, 204800]);
  vi.addRow(["DB-01", "poweredOn", "false", 8, 65536, 1048576, 524288]);
  vi.addRow(["LEGACY-01", "poweredOff", "false", 2, 16384, 524288, 40960]);

  const vd = wb.addWorksheet("vDisk");
  // Real RVTools does not expose a standalone Datastore column here. The
  // datastore is encoded in VMDK Path; Disk Path is the guest drive path.
  vd.addRow(["VM", "Powerstate", "Disk", "Disk Key", "Disk Path", "Capacity MiB", "Thin", "VMDK Path"]);
  vd.addRow(["WEB-01", "poweredOn", "Hard disk 1", 2000, "C:\\", 102400, "true", "[DS-PROD-01] WEB-01/WEB-01.vmdk"]);
  vd.addRow(["DB-01", "poweredOn", "Hard disk 1", 2000, "C:\\", 204800, "true", "[DS-PROD-01] DB-01/DB-01.vmdk"]);
  vd.addRow(["DB-01", "poweredOn", "Hard disk 2", 2001, "D:\\", 1048576, "false", "[DS-PROD-02] DB-01/DB-01_1.vmdk"]);
  vd.addRow(["LEGACY-01", "poweredOff", "Hard disk 1", 2000, "C:\\", 51200, "false", "[DS-PROD-02] LEGACY-01/LEGACY-01.vmdk"]);

  return wb;
}

async function roundTrip(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buf = (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer;
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf as unknown as ExcelJS.Buffer);
  return back;
}

describe("RVTools ingestion (realistic export shape)", () => {
  it("extracts a datastore from a real VMDK path", () => {
    expect(datastoreFromVmdkPath("[DS-PROD-01] WEB-01/WEB-01.vmdk")).toBe("DS-PROD-01");
    expect(datastoreFromVmdkPath("C:\\")).toBe("");
  });

  it("parses vDatastore capacities, strings-with-commas and numerics", async () => {
    const inv = parseRVInventory(await roundTrip(await buildRVToolsWorkbook()));
    expect(inv.datastores).toHaveLength(2);
    const ds1 = inv.datastores.find((d) => d.name === "DS-PROD-01")!;
    const ds2 = inv.datastores.find((d) => d.name === "DS-PROD-02")!;
    expect(ds1.capacityGB).toBe(2048);
    expect(ds1.freeGB).toBe(1024.5);
    expect(ds1.usedGB).toBe(1023.5);
    expect(ds1.cluster).toBe("POD-PROD");
    expect(ds2.capacityGB).toBe(1024); // "1,048,576" MiB string with comma
  });

  it("maps vInfo memory (MiB → GB) and vDisk capacity per datastore", async () => {
    const inv = parseRVInventory(await roundTrip(await buildRVToolsWorkbook()));
    expect(inv.vms).toHaveLength(3);
    const web = inv.vms.find((v) => v.name === "WEB-01")!;
    expect(web.ramGB).toBe(32);
    expect(web.disks).toEqual([{ datastore: "DS-PROD-01", provisionedGB: 100 }]);
    const db = inv.vms.find((v) => v.name === "DB-01")!;
    expect(db.ramGB).toBe(64);
    expect(db.disks).toHaveLength(2); // spans two datastores
    expect(inv.diagnostics?.diskRowsRead).toBe(4);
    expect(inv.diagnostics?.diskRowsMapped).toBe(4);
  });

  it("builds planners rosters with correct per-datastore provisioning", async () => {
    const inv: RVInventory = parseRVInventory(await roundTrip(await buildRVToolsWorkbook()));
    const roster = rosterForDatastore(inv, "DS-PROD-01", { changePct: 2, retentionDays: 3 });
    expect(roster.map((v) => v.name).sort()).toEqual(["DB-01", "WEB-01"]);
    const db = roster.find((v) => v.name === "DB-01")!;
    expect(db.provisionedGB).toBe(200); // only the disk on DS-PROD-01
    expect(db.spans).toBe(2);
  });

  it("sums VM RAM per datastore for bulk rows and assesses cleanly", async () => {
    const inv = parseRVInventory(await roundTrip(await buildRVToolsWorkbook()));
    const rows = inventoryToRows(inv);
    const r1 = rows.find((r) => r.datastore === "DS-PROD-01")!;
    const r2 = rows.find((r) => r.datastore === "DS-PROD-02")!;
    expect(r1.ramGB).toBe(96); // WEB-01 32 + DB-01 64
    expect(r2.ramGB).toBe(80); // DB-01 64 + LEGACY-01 16

    const { valid, invalid } = assessRows(rows);
    expect(invalid).toHaveLength(0);
    expect(valid).toHaveLength(2);
    expect(valid.every((r) => r.health.status === "APPROVED")).toBe(true);
  });
});
