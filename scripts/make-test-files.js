// Generates deterministic test files for the F3 ingestion e2e test.
// Run: node scripts/make-test-files.js
/* eslint-disable @typescript-eslint/no-require-imports */
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "test-files");
fs.mkdirSync(outDir, { recursive: true });

// 3-page PDF with known sentences per page.
const pdfPath = path.join(outDir, "handbook.pdf");
const doc = new PDFDocument();
const stream = fs.createWriteStream(pdfPath);
doc.pipe(stream);

const pages = [
  {
    heading: "Northwind Employee Handbook",
    body:
      "Welcome to Northwind. This handbook explains the policies that apply to every employee. " +
      "The probation period lasts three months and during that time either party may end the employment " +
      "with one week of written notice. After probation the notice period is two months.",
  },
  {
    heading: "Expense Policy",
    body:
      "Travel expenses must be submitted within thirty days of the trip. Economy class flights are " +
      "reimbursed in full and hotel rooms are reimbursed up to one hundred and eighty dollars per night " +
      "in major cities. Meals are reimbursed up to forty dollars per day with receipts.",
  },
  {
    heading: "Remote Work",
    body:
      "Employees may work remotely up to three days per week with manager approval. Fully remote " +
      "arrangements require a written agreement reviewed by Human Resources every six months. " +
      "Home office equipment is reimbursed up to five hundred dollars once every three years.",
  },
];

pages.forEach((p, i) => {
  if (i > 0) doc.addPage();
  doc.font("Times-Bold").fontSize(18).text(p.heading);
  doc.moveDown(1);
  doc.font("Times-Roman").fontSize(12).text(p.body, { align: "left" });
});
doc.end();

// Small Markdown and text files.
fs.writeFileSync(
  path.join(outDir, "notes.md"),
  "# Meeting notes\n\nThe quarterly review is scheduled for the first week of April.\n\n" +
    "Action items: ship the billing update, hire two support agents, and renew the office lease.\n",
);
fs.writeFileSync(
  path.join(outDir, "readme.txt"),
  "DocuMind plain text sample.\n\nThis file has two paragraphs. The second one exists to make chunking split somewhere.\n",
);

// Minimal DOCX: a spec-compliant store-only zip with word/document.xml.
// (Compress-Archive writes backslash entry names, which the zip spec forbids
// and readers like mammoth reject, so we build the zip directly.)
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10); // stored
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

stream.on("finish", () => {
  const docx = makeZip([
    [
      "word/document.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        "<w:p><w:r><w:t>Quarterly finance summary.</w:t></w:r></w:p>" +
        "<w:p><w:r><w:t>Revenue grew fourteen percent year over year. Operating costs stayed flat and the support team reduced ticket backlog by half. The board approved a hiring freeze for non-essential roles.</w:t></w:r></w:p>" +
        "</w:body></w:document>",
    ],
    [
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        "</Types>",
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>",
    ],
  ]);
  fs.writeFileSync(path.join(outDir, "summary.docx"), docx);
  console.log("test files ready:", fs.readdirSync(outDir).join(", "));
});
