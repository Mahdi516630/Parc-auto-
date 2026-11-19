import React from 'react';
import { createDefaultFormConfig, formatDateFr, padOrderId } from '../constants';
import type { CustomFieldDefinition, FormConfig, RepairOrder } from '../types';

function formatCustomPrintValue(
  field: CustomFieldDefinition,
  val: string | boolean | undefined,
): string {
  if (field.type === 'checkbox') {
    return val === true ? '☑ Oui' : '☐ Non';
  }
  const str = String(val || '').trim();
  if (!str) return '—';
  if (field.type === 'date') return formatDateFr(str);
  return str;
}

export const OfficialSheet: React.FC<{ order: RepairOrder; formConfig?: FormConfig }> = ({
  order,
  formConfig,
}) => {
  const cfg = formConfig || createDefaultFormConfig();
  const checklistItems = cfg.checklistItems;
  const activeCustomFields = cfg.customFields.filter((f) => f.enabled);

  return (
    <div className="sheet">
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '11pt' }}>
        République de Djibouti
      </div>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '14pt' }}>
        Présidence de la République
      </div>
      <div style={{ textAlign: 'center', fontWeight: 700, margin: '2px 0 10px' }}>
        Parc Auto Protocole
      </div>

      <div style={{ textAlign: 'right', fontWeight: 700 }}>
        Ordre de Réparation
        <br />
        N° {padOrderId(order.id)}
      </div>

      <table style={{ margin: '10px 0' }}>
        <thead>
          <tr>
            <th>Marque</th>
            <th>Modèle</th>
            <th>N° immatriculation</th>
            <th>VIN</th>
            <th>Kilométrage</th>
            <th>Date de travaux</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{order.marque}</td>
            <td>{order.modele}</td>
            <td>{order.immat}</td>
            <td>{order.vin || '—'}</td>
            <td>{order.km.toLocaleString('fr-FR')} km</td>
            <td>{formatDateFr(order.date)}</td>
          </tr>
        </tbody>
      </table>

      {activeCustomFields.length > 0 && (
        <table style={{ margin: '6px 0 10px' }}>
          <tbody>
            {activeCustomFields.map((field) => (
              <tr key={field.id}>
                <td style={{ fontWeight: 700, width: '38%' }}>{field.label}</td>
                <td>{formatCustomPrintValue(field, order.customValues?.[field.id])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <b>Description du travail</b>
      <table style={{ margin: '6px 0' }}>
        <tbody>
          {checklistItems.map((item, index) => (
            <tr key={`${index}-${item}`}>
              <td>{item} :</td>
              <td style={{ width: '44px', textAlign: 'center', fontSize: '13pt' }}>
                {order.checks[index] ? '☑' : '☐'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <b>REMARQUE</b>
      <div
        style={{
          border: '1px solid #000',
          padding: '6px 8px',
          minHeight: '52px',
          margin: '4px 0 18px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {order.remarque || ''}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px' }}>
        <div>
          Nom du technicien : {order.tech || ''}
          <br />
          <br />
          Signature :
        </div>
        <div style={{ minWidth: '220px' }}>
          Nom du contrôleur : {order.ctrl || ''}
          <br />
          <br />
          Signature :
        </div>
      </div>
    </div>
  );
};

export const PrintSheetsContainer: React.FC<{
  orders: RepairOrder[];
  formConfig?: FormConfig;
}> = ({ orders, formConfig }) => {
  return (
    <div id="print-root">
      {orders.map((order) => (
        <OfficialSheet key={order.id} order={order} formConfig={formConfig} />
      ))}
    </div>
  );
};
