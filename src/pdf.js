/**
 * PDF invoice renderer using pdfkit.
 * Produces a clean, professional, GST-compliant invoice.
 */
const PDFDocument = require('pdfkit');

function fmtMoney(n, symbol = 'Rs. ') {
  const v = (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  // Thousands separator
  const [int, dec] = v.split('.');
  return symbol + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

function buildInvoicePdf(stream, { invoice, business }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(stream);

  const currency = business.currency_symbol === '₹' ? 'Rs. ' : (business.currency_symbol || '$ ');

  // ---- Header ----
  doc.fontSize(22).fillColor('#111').text(business.name || 'Business', 40, 40);
  doc.fontSize(9).fillColor('#555');
  if (business.address) doc.text(business.address, 40, 68, { width: 260 });
  if (business.phone) doc.text(`Phone: ${business.phone}`);
  if (business.email) doc.text(`Email: ${business.email}`);
  if (business.gstin) doc.text(`GSTIN: ${business.gstin}`);
  if (business.state) doc.text(`State: ${business.state}`);

  // Invoice block (right)
  doc.fontSize(24).fillColor('#2563eb').text('INVOICE', 400, 40, { align: 'right' });
  doc.fontSize(10).fillColor('#111');
  doc.text(`Invoice #: ${invoice.invoice_number}`, 400, 72, { align: 'right' });
  doc.text(`Issue Date: ${invoice.issue_date}`, 400, 88, { align: 'right' });
  if (invoice.due_date) doc.text(`Due Date: ${invoice.due_date}`, 400, 104, { align: 'right' });
  doc.text(`Status: ${String(invoice.status).toUpperCase()}`, 400, 120, { align: 'right' });

  // Divider
  doc.moveTo(40, 170).lineTo(555, 170).strokeColor('#e5e7eb').lineWidth(1).stroke();

  // ---- Bill To ----
  const c = invoice.customer || {};
  doc.fontSize(10).fillColor('#6b7280').text('BILL TO', 40, 185);
  doc.fontSize(12).fillColor('#111').text(c.name || '-', 40, 200);
  doc.fontSize(9).fillColor('#444');
  let y = 216;
  if (c.address) { doc.text(c.address, 40, y, { width: 260 }); y += doc.heightOfString(c.address, { width: 260 }); }
  if (c.email) { doc.text(`Email: ${c.email}`, 40, y); y += 12; }
  if (c.phone) { doc.text(`Phone: ${c.phone}`, 40, y); y += 12; }
  if (c.gstin) { doc.text(`GSTIN: ${c.gstin}`, 40, y); y += 12; }
  if (c.state) { doc.text(`State: ${c.state}`, 40, y); y += 12; }

  const supplyType = invoice.is_interstate ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)';
  doc.fontSize(9).fillColor('#6b7280').text('PLACE OF SUPPLY', 400, 185, { align: 'right' });
  doc.fontSize(10).fillColor('#111').text(supplyType, 400, 200, { align: 'right' });

  // ---- Table ----
  const tableTop = Math.max(y + 20, 285);
  doc.rect(40, tableTop, 515, 20).fill('#111');
  doc.fillColor('#fff').fontSize(9);
  doc.text('#', 45, tableTop + 6, { width: 20 });
  doc.text('DESCRIPTION', 70, tableTop + 6, { width: 180 });
  doc.text('HSN', 255, tableTop + 6, { width: 40 });
  doc.text('QTY', 300, tableTop + 6, { width: 35, align: 'right' });
  doc.text('RATE', 340, tableTop + 6, { width: 55, align: 'right' });
  doc.text('GST%', 400, tableTop + 6, { width: 30, align: 'right' });
  doc.text('GST', 435, tableTop + 6, { width: 55, align: 'right' });
  doc.text('TOTAL', 495, tableTop + 6, { width: 55, align: 'right' });

  let ry = tableTop + 24;
  doc.fillColor('#111').fontSize(9);
  invoice.items.forEach((li, i) => {
    const rowH = Math.max(18, doc.heightOfString(li.description || '', { width: 180 }) + 6);
    if (ry + rowH > 740) { doc.addPage(); ry = 60; }
    if (i % 2 === 0) doc.rect(40, ry - 3, 515, rowH).fill('#f9fafb').fillColor('#111');
    doc.fillColor('#111');
    doc.text(String(i + 1), 45, ry, { width: 20 });
    doc.text(li.description || '', 70, ry, { width: 180 });
    doc.text(li.hsn_code || '-', 255, ry, { width: 40 });
    doc.text(String(li.quantity), 300, ry, { width: 35, align: 'right' });
    doc.text(fmtMoney(li.unit_price, currency), 340, ry, { width: 55, align: 'right' });
    doc.text(`${li.gst_rate}%`, 400, ry, { width: 30, align: 'right' });
    doc.text(fmtMoney(li.gst_amount, currency), 435, ry, { width: 55, align: 'right' });
    doc.text(fmtMoney(li.total, currency), 495, ry, { width: 55, align: 'right' });
    ry += rowH;
  });

  // ---- Totals ----
  ry += 10;
  if (ry > 680) { doc.addPage(); ry = 60; }

  const labelX = 340, valueX = 495;
  const drawTotal = (label, value, bold) => {
    doc.fontSize(bold ? 11 : 9).fillColor(bold ? '#111' : '#374151').font(bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(label, labelX, ry, { width: 150, align: 'right' });
    doc.text(value, valueX, ry, { width: 55, align: 'right' });
    ry += bold ? 18 : 14;
    doc.font('Helvetica');
  };
  drawTotal('Subtotal:', fmtMoney(invoice.subtotal, currency));
  if (invoice.is_interstate) {
    drawTotal('IGST:', fmtMoney(invoice.igst_total, currency));
  } else {
    drawTotal('CGST:', fmtMoney(invoice.cgst_total, currency));
    drawTotal('SGST:', fmtMoney(invoice.sgst_total, currency));
  }
  if (invoice.discount && Number(invoice.discount) > 0) {
    drawTotal('Discount:', '-' + fmtMoney(invoice.discount, currency));
  }
  doc.moveTo(340, ry).lineTo(555, ry).strokeColor('#e5e7eb').stroke();
  ry += 6;
  drawTotal('TOTAL:', fmtMoney(invoice.total, currency), true);

  // ---- Notes & Footer ----
  if (invoice.notes) {
    if (ry > 700) { doc.addPage(); ry = 60; }
    doc.fontSize(9).fillColor('#6b7280').text('Notes', 40, ry + 10);
    doc.fontSize(9).fillColor('#111').text(invoice.notes, 40, ry + 24, { width: 300 });
  }
  if (invoice.payment_method || invoice.payment_date) {
    doc.fontSize(9).fillColor('#6b7280').text('Payment', 40, ry + 70);
    doc.fillColor('#111').text(
      `${invoice.payment_method || '-'}${invoice.payment_date ? ' on ' + invoice.payment_date : ''}`,
      40, ry + 84
    );
  }

  doc.fontSize(8).fillColor('#9ca3af').text(
    'Thank you for your business.',
    40, 800, { align: 'center', width: 515 }
  );

  doc.end();
}

module.exports = { buildInvoicePdf };
