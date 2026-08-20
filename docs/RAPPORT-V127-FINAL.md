# MomentoBooth — Rapport de transformation en photomaton

## Décision d’architecture

La version finale conserve la réécriture v127 comme socle technique et récupère sélectivement les éléments utiles de l’archive Claude v118. Le monolithe v118 et son relais JPEG permanent n’ont pas été réimportés comme chemin principal, car ils réintroduiraient les défauts de fluidité et de maintenance que la réécriture devait corriger.

## Fonctionnalités intégrées

La borne dispose maintenant d’un écran de veille tactile utilisant les assets v118, d’un réveil explicite, d’un parcours tablette séparé du module caméra, d’une sélection de looks, d’une série de 1 à 6 prises, d’un compte à rebours par prise, d’un résultat avec miniatures, de la conservation séparée des originaux et variantes filtrées, d’un enregistrement galerie, d’un QR généré localement par le serveur et d’un partage natif ou par copie de lien.

Le module caméra iPhone reste verrouillé : il ne peut ni lancer un compte à rebours ni déclencher une capture depuis ses contrôles. Le flux WebRTC utilise maintenant une configuration ICE et attend la fin du rassemblement ICE avant publication de l’offre ou de la réponse. Le nettoyage `pagehide` arrête les pistes caméra, le tracker et la connexion peer-to-peer.

Les assets PWA et MediaPipe local de v118 sont présents dans v127 : manifest, service worker réseau-first, icônes, animations de veille, tutoriels, bundle WASM et modèle `face_landmarker.task`. Le moteur d’effets v127 accepte une boucle de détection injectable et des accessoires géométriques lissés.

## Validation exécutée

| Vérification | Résultat |
|---|---|
| Syntaxe `app.mjs`, `server.mjs`, moteurs runtime | Réussie |
| Tests unitaires v127 | 13 réussis |
| Smoke pairage → capacités → commandes → WebRTC → galerie | Réussi |
| Endpoint QR v127 | Réussi, data URL PNG générée |
| Manifest JSON | Valide |
| PWA assets et MediaPipe | Présents et non vides |
| Réponse de santé locale | `storage: ready` |
| Interface statique locale | HTTP 200 |

## Fichiers principaux

Le produit actif est dans `/home/ubuntu/momentobooth_audit/rewrite-v127`. Le dossier Claude est conservé séparément dans `/home/ubuntu/momentobooth_audit/claude-v118-audit`. Le cahier des charges produit est dans `/home/ubuntu/momentobooth_audit/CAHIER-DES-CHARGES-PHOTOMATON.md`. L’entrée Modal a été adaptée dans `/home/ubuntu/momentobooth_audit/modal_app.py`.

## Recette nécessaire sur le matériel réel

La validation sandbox ne remplace pas une recette sur l’iPhone 11 et la tablette Huawei. Il faut ouvrir la même URL Modal sur les deux appareils, choisir Caméra sur l’iPhone et Interface sur la tablette, créer le pairage, accepter une seule fois sur l’iPhone, vérifier que l’aperçu tablette devient fluide, choisir trois prises, réaliser une série, scanner le QR avec un troisième téléphone, couper puis rétablir le Wi-Fi et recommencer. Il faut également vérifier Safari/PWA après suppression de l’ancienne icône, car les navigateurs iOS conservent parfois un état d’installation historique.

## Limite honnête

Le produit est maintenant une base complète de photomaton et non plus un simple prototype d’écran. Il ne doit toutefois être déclaré « prêt pour l’événement » qu’après la recette physique sur le réseau réellement utilisé. En particulier, un réseau qui bloque les chemins ICE peut nécessiter un serveur TURN ; le fallback applicatif existe, mais il sera moins fluide que WebRTC.
