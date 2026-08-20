# Panneau de config des 4 modes de don — Spec UX

## But
Permettre à Lévy de configurer le lien de dons (`https://payrequest.me/lvs0`) de **4 manières différentes**, activables indépendamment ou en combo. Config persistée côté serveur (déjà en place via `donation.enabled` + nouvelle clé `donation.modes`).

## Les 4 modes

### Mode 1 — **Pop-up discrète** (par défaut pour événements silencieux)
- Apparition après 3 captures faites OU au bout de 5 min d'inactivité
- Card en bas de l'écran, `position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%)`
- Contenu : "Tu t'amuses ? ☕ Offre-moi un café" + bouton "Voir" → ouvre `payrequest.me/lvs0` en nouvel onglet
- Bouton ✕ pour fermer (rétractable 5s)
- **Pas d'interruption du flow** photo

### Mode 2 — **Écran de veille** (pour événements longs)
- S'active si AUCUNE interaction depuis 90s (réglable)
- Remplace l'écran d'accueil : ton GIF de la main qui pousse le bouton tourne en fond + en bas, **le lien de don s'affiche en petit en overlay coin bas-gauche**
- Tap n'importe où = retour écran normal
- Le GIF de la main + lien = l'animation assets dont tu parles

### Mode 3 — **Bouton dans l'UI** (déjà mentionné par Lévy)
- Mini bouton "☕" dans la barre de contrôle, en mode `aria-hidden="false"`
- Clic → ouvre la pop-up complète avec QR code intégré + lien clickable
- Position : top-right ou bottom-right (pas de chevauchement avec capture)

### Mode 4 — **Présent dans l'écran de sélection de mode** (le "modes selection screen")
- À côté des modes "Anniversaire" / "Mariage" / "Soirée", un mode **"Avec don"** (toggle)
- Coché = pop-up + bouton UI activés
- Décoché = mode 2 (écran de veille) prend le relais
- Visible au premier lancement ou via paramètres avancés

## Config JSON (serveur)

```json
{
  "donation": {
    "url": "https://payrequest.me/lvs0",
    "enabled": false,
    "modes": {
      "popup": true,
      "screensaver": true,
      "uiButton": true,
      "modesScreen": true
    },
    "triggers": {
      "popup": { "type": "count", "value": 3 },
      "screensaver": { "type": "idle", "value": 90 }
    },
    "showQR": true,
    "customText": "Tu t'amuses ? ☕ Offre-moi un café pour soutenir le dev !"
  }
}
```

## UI Admin (côté serveur, route `/admin/donation`)
- Form simple (HTML server-rendered) :
  - URL pré-remplie `payrequest.me/lvs0` (modifiable)
  - Toggle global "Activer le don" (master switch)
  - 4 checkboxes pour les 4 modes
  - 2 champs triggers (count + idle seconds)
  - Toggle "Afficher QR code dans la pop-up"
  - Textarea "Texte personnalisé"
  - Bouton "Enregistrer" + "Désactiver tout" (le fameux "désactiver")

## Comportement par défaut
**Tout désactivé** sauf Mode 2 (screensaver) qui est doux. Tu actives ce que tu veux. Tu peux tout couper d'un coup.

## Fichiers à toucher
- `server/server.js` : nouvelle route admin + endpoint `GET/PUT /api/admin/donation`
- `public/index.html` : 4 nouveaux blocs (pop-up, screensaver, UI button, mode badge) — tous `aria-hidden="true"` par défaut
- `public/css/styles.css` : styles pour chaque mode (~150 lignes)
- `public/js/donation.js` (nouveau) : ~200 lignes — gère les 4 modes
- `public/js/app.js` : import du module + appel `initDonation(state.donation)` au boot

## Estimation
- **45 min** d'implémentation + test (delegatable à Claude Code en sous-`passarelle` task une fois que les P0 sont fixés)
