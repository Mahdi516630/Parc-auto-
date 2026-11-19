import type { PermissionKey, RoleDefinition, UserPermissions } from './types';

export const CHECKLIST_ITEMS: readonly string[] = [
  'Vérification de batterie',
  'Vérification alternateur',
  'Vérification démarrage',
  'Vérification klaxon',
  'Contrôle de fonctionnement de l’éclairage avant',
  'Contrôle de fonctionnement des feux de stop',
  'Contrôle de fonctionnement des feux de recul',
  'Contrôle de fonctionnement des feux de détresse',
  'Contrôle de fonctionnement de l’éclairage intérieur',
  'Contrôle de fonctionnement de l’avertisseur sonore',
  'Vérification de la climatisation et de la ventilation',
  'Vérification des commandes au tableau de bord',
  'Vérification des lève-vitres AV et AR',
  'Vérifier l’absence de défauts sur l’ordinateur de bord',
  'Recompléter les niveaux de la batterie, vérification de sa fixation',
  'Essai routier',
] as const;

export const SHORT_CHECKLIST_LABELS: readonly string[] = [
  '1. Batterie',
  '2. Alternateur',
  '3. Démarrage',
  '4. Klaxon',
  '5. Éclairage AV',
  '6. Feux stop',
  '7. Feux recul',
  '8. Feux détresse',
  '9. Éclairage int.',
  '10. Avertisseur',
  '11. Clim & ventil.',
  '12. Tableau bord',
  '13. Lève-vitres',
  '14. Ordinateur bord',
  '15. Niveaux batterie',
  '16. Essai routier',
] as const;

export const PERMISSION_DEFINITIONS: Array<{
  key: PermissionKey;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: 'viewOrders',
    label: 'Consulter les ordres',
    shortLabel: 'Consulter',
    description: 'Accéder à la base centrale partagée des ordres de réparation',
  },
  {
    key: 'createOrders',
    label: 'Créer des ordres',
    shortLabel: 'Créer',
    description: 'Enregistrer de nouveaux ordres de réparation dans le système',
  },
  {
    key: 'editOrders',
    label: 'Modifier les ordres',
    shortLabel: 'Modifier',
    description: 'Mettre à jour les fiches, contrôles et remarques existantes',
  },
  {
    key: 'deleteOrders',
    label: 'Supprimer des ordres',
    shortLabel: 'Supprimer',
    description: 'Retirer définitivement un ordre de la base centrale',
  },
  {
    key: 'printOrders',
    label: 'Imprimer les fiches',
    shortLabel: 'Imprimer',
    description: 'Générer et imprimer les fiches officielles de réparation',
  },
  {
    key: 'exportData',
    label: 'Exporter PDF / Excel',
    shortLabel: 'Exporter',
    description: 'Télécharger les rapports consolidés au format PDF ou Excel',
  },
  {
    key: 'manageUsers',
    label: 'Administration & Droits',
    shortLabel: 'Admin',
    description: 'Valider les inscriptions, gérer les comptes et personnaliser les droits',
  },
];

export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    id: 'admin',
    label: 'Administrateur',
    description: 'Accès complet au système, validation des comptes et gestion des droits.',
    isSystem: true,
    permissions: {
      viewOrders: true,
      createOrders: true,
      editOrders: true,
      deleteOrders: true,
      printOrders: true,
      exportData: true,
      manageUsers: true,
    },
  },
  {
    id: 'gestionnaire',
    label: 'Gestionnaire',
    description: 'Création, suivi, impression et exportation des ordres du parc.',
    isSystem: true,
    permissions: {
      viewOrders: true,
      createOrders: true,
      editOrders: true,
      deleteOrders: false,
      printOrders: true,
      exportData: true,
      manageUsers: false,
    },
  },
  {
    id: 'technicien',
    label: 'Technicien',
    description: 'Saisie des interventions, contrôles techniques et impression des fiches.',
    isSystem: true,
    permissions: {
      viewOrders: true,
      createOrders: true,
      editOrders: true,
      deleteOrders: false,
      printOrders: true,
      exportData: false,
      manageUsers: false,
    },
  },
  {
    id: 'controleur',
    label: 'Contrôleur',
    description: 'Vérification des contrôles qualité, validation technique et exports.',
    isSystem: true,
    permissions: {
      viewOrders: true,
      createOrders: false,
      editOrders: true,
      deleteOrders: false,
      printOrders: true,
      exportData: true,
      manageUsers: false,
    },
  },
  {
    id: 'consultant',
    label: 'Consultant',
    description: 'Consultation des ordres partagés et impression uniquement.',
    isSystem: true,
    permissions: {
      viewOrders: true,
      createOrders: false,
      editOrders: false,
      deleteOrders: false,
      printOrders: true,
      exportData: false,
      manageUsers: false,
    },
  },
];

export function emptyPermissions(): UserPermissions {
  return {
    viewOrders: false,
    createOrders: false,
    editOrders: false,
    deleteOrders: false,
    printOrders: false,
    exportData: false,
    manageUsers: false,
  };
}

export function padOrderId(id: number): string {
  return String(id).padStart(7, '0');
}

export function formatDateFr(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDateTimeFr(isoString?: string): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
