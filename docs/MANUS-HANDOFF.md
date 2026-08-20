# Transmission MomentoBooth à Claude

## Règle principale

La base de travail obligatoire est `rewrite-v127`. Elle contient déjà la réécriture modulaire : état des rôles, pairage, stores atomiques, galerie, capture, effets, tracker facial, client distant, WebRTC, écran de veille, séries photo et QR.

`claude-v118-audit` est une archive de référence. Elle contient les assets, le MediaPipe local, les fonctions historiques, les tests Playwright et la documentation de l’ancienne version. Ne pas recopier son monolithe `public/js/app.js` dans v127 et ne pas remplacer le WebRTC v127 par le relais JPEG historique.

## Archives

- `momentobooth-rewrite-v127.zip` : base active à améliorer.
- `momentobooth-claude-v118-reference.zip` : référence fonctionnelle et visuelle.

## Données exclues volontairement

Les archives n’incluent pas `node_modules`, les fichiers de sessions ou galeries locales, ni les dossiers de photos générées. Ces éléments peuvent contenir des données d’exécution et ne sont pas nécessaires pour reprendre le code.

## Reprise recommandée

Après extraction, vérifier les chemins réels avec `pwd` et `find`. Travailler uniquement dans le dossier extrait de `momentobooth-rewrite-v127`. Installer les dépendances depuis le manifeste et le lockfile, exécuter les tests, puis auditer les fichiers avant toute modification. Garder l’archive v118 en lecture/référence.

## État de validation connu

La v127 a passé 13 tests unitaires, le smoke test pairage → capacités → commandes → WebRTC → galerie, la génération QR locale, la validation du manifest PWA et la syntaxe Modal. La v118 a passé 7 tests serveur et 4 tests Playwright locaux, mais son aperçu distant reste un relais JPEG HTTP et elle ne contient pas de `RTCPeerConnection`.

## Limites à ne pas masquer

La recette iPhone 11 + tablette Huawei + Wi-Fi réel n’a pas été exécutée dans le sandbox. Le déploiement Modal production n’a pas été lancé depuis ce travail. Toute déclaration « prêt pour l’anniversaire » doit donc être accompagnée d’une recette physique explicite.
