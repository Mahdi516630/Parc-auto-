import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { createDefaultFormConfig, formatDateFr, padOrderId } from '../constants';
import type { CustomFieldDefinition, FormConfig, RepairOrder } from '../types';

function getCheckedDescriptions(order: RepairOrder, checklistItems: string[]): string[] {
  return checklistItems.filter((_, idx) => Boolean(order.checks[idx]));
}

function formatCustomExportValue(
  field: CustomFieldDefinition,
  val: string | boolean | undefined,
  forPdf = false,
): string {
  if (field.type === 'checkbox') {
    if (forPdf) return val === true ? '[X] Oui' : '[ ] Non';
    return val === true ? 'Oui' : 'Non';
  }
  const str = String(val || '').trim();
  if (!str) return '—';
  if (field.type === 'date') return formatDateFr(str);
  return str;
}

export function exportOrdersToExcel(
  orders: RepairOrder[],
  exportedBy: string,
  formConfig?: FormConfig,
): void {
  const cfg = formConfig || createDefaultFormConfig();
  const checklist = cfg.checklistItems;
  const activeCustomFields = cfg.customFields.filter((f) => f.enabled);
  const totalChecks = checklist.length;

  const summaryRows = orders.map((o) => {
    const checkedItems = getCheckedDescriptions(o, checklist);
    const row: Record<string, string | number> = {
      'N° Ordre': padOrderId(o.id),
      'Date des travaux': formatDateFr(o.date),
      Marque: o.marque,
      Modèle: o.modele,
      'N° Immatriculation': o.immat,
      VIN: o.vin || '—',
      'Kilométrage (km)': o.km,
      'Contrôles effectués': `${checkedItems.length}/${totalChecks}`,
      'Taux de contrôle (%)':
        totalChecks > 0 ? Math.round((checkedItems.length / totalChecks) * 100) : 100,
      'Description du travail (éléments cochés)':
        checkedItems.length > 0
          ? checkedItems.map((item) => `• ${item}`).join('\n')
          : 'Aucun élément coché',
    };

    for (const field of activeCustomFields) {
      row[field.label] = formatCustomExportValue(field, o.customValues?.[field.id], false);
    }

    row.Remarque = o.remarque || '';
    row.Technicien = o.tech || '—';
    row.Contrôleur = o.ctrl || '—';
    row['Créé par'] = o.createdByName;
    return row;
  });

  const detailRows = orders.map((o) => {
    const row: Record<string, string | number> = {
      'N° Ordre': padOrderId(o.id),
      Date: formatDateFr(o.date),
      Véhicule: `${o.marque} ${o.modele}`,
      Immatriculation: o.immat,
      'Kilométrage (km)': o.km,
      'Créé par': o.createdByName,
    };
    for (const field of activeCustomFields) {
      row[field.label] = formatCustomExportValue(field, o.customValues?.[field.id], false);
    }
    checklist.forEach((label, idx) => {
      row[`${idx + 1}. ${label}`] = o.checks[idx] ? 'Fait' : 'Non fait';
    });
    return row;
  });

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 12 },
    { wch: 16 },
    { wch: 15 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 52 },
    ...activeCustomFields.map(() => ({ wch: 22 })),
    { wch: 36 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ordres de Réparation');

  const wsDetails = XLSX.utils.json_to_sheet(detailRows);
  wsDetails['!cols'] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 24 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
    ...activeCustomFields.map(() => ({ wch: 20 })),
    ...checklist.map(() => ({ wch: 14 })),
  ];
  XLSX.utils.book_append_sheet(wb, wsDetails, 'Détail Contrôles');

  const metaSheet = XLSX.utils.json_to_sheet([
    {
      Institution: 'République de Djibouti — Présidence de la République',
      Service: 'Parc Auto Protocole',
      'Date d’export': new Date().toLocaleString('fr-FR'),
      'Exporté par': exportedBy,
      'Nombre d’ordres': orders.length,
    },
  ]);
  XLSX.utils.book_append_sheet(wb, metaSheet, 'Métadonnées');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Parc_Auto_Protocole_Ordres_${stamp}.xlsx`);
}

export function exportOrdersToPdf(
  orders: RepairOrder[],
  exportedBy: string,
  formConfig?: FormConfig,
): void {
  const cfg = formConfig || createDefaultFormConfig();
  const checklist = cfg.checklistItems;
  const activeCustomFields = cfg.customFields.filter((f) => f.enabled);
  const totalChecks = checklist.length;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Djibouti tricolor stripe at top
  doc.setFillColor(106, 178, 231); // #6ab2e7
  doc.rect(0, 0, pageWidth, 2.5, 'F');
  doc.setFillColor(18, 173, 43); // #12ad2b
  doc.rect(0, 2.5, pageWidth, 2.5, 'F');

  doc.setTextColor(15, 31, 61);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('République de Djibouti · Présidence de la République', 14, 13);

  doc.setFontSize(16);
  doc.text('Parc Auto Protocole — Registre des Ordres de Réparation', 14, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(74, 84, 104);
  doc.text(
    `Exporté le ${new Date().toLocaleString('fr-FR')} par ${exportedBy} · ${orders.length} ordre(s)`,
    14,
    26,
  );

  autoTable(doc, {
    startY: 31,
    head: [
      [
        'N° Ordre',
        'Date',
        'Véhicule & Immat.',
        'Km',
        'Contrôles',
        'Description du travail (éléments cochés)',
        activeCustomFields.length > 0 ? 'Remarque & Compléments' : 'Remarque',
        'Intervenants',
        'Créé par',
      ],
    ],
    body: orders.map((o) => {
      const checkedItems = getCheckedDescriptions(o, checklist);
      const checkedText =
        checkedItems.length > 0
          ? checkedItems.map((item) => `• ${item}`).join('\n')
          : 'Aucun élément coché';

      const customLines = activeCustomFields.map(
        (field) =>
          `${field.label}: ${formatCustomExportValue(field, o.customValues?.[field.id], true)}`,
      );
      const remarkAndCustom = [o.remarque || '', ...customLines]
        .filter((s) => s.trim().length > 0)
        .join('\n');

      return [
        padOrderId(o.id),
        formatDateFr(o.date),
        `${o.marque} ${o.modele}\nImmat. ${o.immat}${o.vin ? `\nVIN: ${o.vin}` : ''}`,
        `${o.km.toLocaleString('fr-FR')} km`,
        `${checkedItems.length}/${totalChecks}`,
        checkedText,
        remarkAndCustom || '—',
        `Tech: ${o.tech || '—'}\nCtrl: ${o.ctrl || '—'}`,
        o.createdByName,
      ];
    }),
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [15, 31, 61],
      overflow: 'linebreak',
      valign: 'top',
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 19 },
      2: { cellWidth: 36 },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 76 },
      6: { cellWidth: 40 },
      7: { cellWidth: 27 },
      8: { cellWidth: 23 },
    },
    headStyles: {
      fillColor: [29, 95, 150], // #1d5f96
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [244, 245, 248],
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`Parc_Auto_Protocole_Registre_${stamp}.pdf`);
}

export function exportOfficialSheetsToPdf(
  orders: RepairOrder[],
  formConfig?: FormConfig,
): void {
  const cfg = formConfig || createDefaultFormConfig();
  const checklist = cfg.checklistItems;
  const activeCustomFields = cfg.customFields.filter((f) => f.enabled);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  orders.forEach((o, index) => {
    if (index > 0) {
      doc.addPage();
    }

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('République de Djibouti', 105, 15, { align: 'center' });
    doc.setFontSize(14);
    doc.text('Présidence de la République', 105, 22, { align: 'center' });
    doc.setFontSize(11.5);
    doc.text('Parc Auto Protocole', 105, 28, { align: 'center' });

    doc.setFontSize(11);
    doc.text('Ordre de Réparation', 196, 35, { align: 'right' });
    doc.text(`N° ${padOrderId(o.id)}`, 196, 40, { align: 'right' });

    autoTable(doc, {
      startY: 44,
      head: [['Marque', 'Modèle', 'N° immatriculation', 'VIN', 'Kilométrage', 'Date de travaux']],
      body: [
        [
          o.marque,
          o.modele,
          o.immat,
          o.vin || '—',
          `${o.km.toLocaleString('fr-FR')} km`,
          formatDateFr(o.date),
        ],
      ],
      theme: 'grid',
      styles: {
        fontSize: 9,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [244, 245, 248],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
      },
    });

    let currentY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 64;

    if (activeCustomFields.length > 0) {
      autoTable(doc, {
        startY: currentY + 4,
        body: activeCustomFields.map((field) => [
          field.label,
          formatCustomExportValue(field, o.customValues?.[field.id], true),
        ]),
        theme: 'grid',
        styles: {
          fontSize: 8.5,
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          cellPadding: 1.8,
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 68, fillColor: [244, 245, 248] },
        },
      });
      currentY =
        (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
        currentY + 12;
    }

    const doneCount = checklist.filter((_, idx) => Boolean(o.checks[idx])).length;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(
      `Description du travail (${doneCount}/${checklist.length} effectués)`,
      14,
      currentY + 7,
    );

    autoTable(doc, {
      startY: currentY + 10,
      body: checklist.map((item, idx) => [
        `${item} :`,
        o.checks[idx] ? '[X] Cochée' : '[ ] Non',
      ]),
      theme: 'grid',
      styles: {
        fontSize: 8.5,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        cellPadding: 1.6,
      },
      columnStyles: {
        1: { halign: 'center', cellWidth: 30, fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const isChecked = Boolean(o.checks[data.row.index]);
          if (isChecked) {
            data.cell.styles.fillColor = [238, 248, 240];
            if (data.column.index === 1) {
              data.cell.styles.textColor = [11, 107, 31];
            }
          }
        }
      },
    });

    const afterChecksY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 220;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('REMARQUE', 14, afterChecksY + 7);
    doc.setDrawColor(0, 0, 0);
    doc.rect(14, afterChecksY + 9, 182, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const remarkLines = doc.splitTextToSize(o.remarque || 'Aucune remarque.', 176);
    doc.text(remarkLines, 17, afterChecksY + 14);

    const sigY = afterChecksY + 36;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Nom du technicien : ${o.tech || '________________'}`, 14, sigY);
    doc.text('Signature :', 14, sigY + 10);
    doc.text(`Nom du contrôleur : ${o.ctrl || '________________'}`, 118, sigY);
    doc.text('Signature :', 118, sigY + 10);
  });

  const filename =
    orders.length === 1
      ? `Ordre_Reparation_${padOrderId(orders[0].id)}.pdf`
      : `Ordres_Reparation_Selection_${orders.length}.pdf`;
  doc.save(filename);
}
