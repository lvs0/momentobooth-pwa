# Cahier des charges maître — MomentoBooth

## Source de vérité et méthode

L’archive fournie par l’utilisateur est la dernière version actuelle de MomentBooth. Elle doit être auditée et améliorée directement. Il ne faut pas chercher une réécriture externe invisible, repartir de zéro ou importer un monolithe sans analyse. Avant chaque lot, conserver une copie ou un commit local, inventorier les fichiers modifiés et exécuter les tests correspondants.

Le produit cible est une borne de photomaton composée d’un iPhone 11 utilisé comme caméra, d’une tablette Huawei utilisée comme interface et contrôleur, et d’un backend Modal utilisé pour le pairage, le signaling, la galerie, le QR et la synchronisation nécessaire. La borne doit fonctionner malgré les coupures réseau, sans dépendre de Modal pour chaque interaction rapide.

## Principe produit

L’invité doit voir une borne extrêmement simple : veille, toucher pour commencer, choix éventuel du look, capture, résultat, partage et retour automatique. L’organisateur doit disposer d’une interface séparée pour régler le parcours, les filtres, les animations, les formats, les thèmes, la disposition et les capacités de la borne.

Les cinq espaces sont : **Veille**, **Capture**, **Résultat**, **Galerie** et **Réglages organisateur**. L’iPhone en mode Caméra n’affiche que le flux envoyé et un état de connexion. Le mode Interface reprend les fonctions de contrôle du mode Mixte, mais utilise le flux de l’iPhone connecté. Le mode Mixte reste disponible pour un appareil unique.

## Priorité P0 — indispensable pour l’anniversaire

Le démarrage doit permettre de choisir le mode en touchant directement une carte : aucune case à cocher suivie d’un bouton Continuer. Le mode sélectionné s’ouvre immédiatement.

Le mode Caméra doit être minimal : flux caméra, état connecté/recherche et éventuellement indicateur de verrouillage. Aucun bouton de photo, compteur, choix du nombre de prises, carrousel ou réglage organisateur ne doit apparaître.

Le mode Interface doit rechercher automatiquement le flux de l’iPhone, afficher les états recherche, connexion, reconnexion, appareil absent et session expirée, puis permettre de piloter la capture. Les popups instables sont à supprimer au profit d’un seul panneau d’état positionné dans le viewport réel.

Le bouton de capture doit être configurable, mais désactivé par défaut. La capture au clic sur l’aperçu doit être un réglage indépendant, également désactivé par défaut. Le choix invité du nombre de photos doit être activable ou masqué ; l’organisateur fixe alors une valeur de 1 à 6. Le compteur doit être activable ou désactivable. S’il est désactivé, un délai de préparation fixe, configurable de 1 à 5 secondes, doit être utilisé afin d’éviter une capture surprise.

La série doit afficher une progression et conserver chaque original et chaque variante. Le retour automatique après export doit revenir vers la caméra ou la veille selon un réglage, après réinitialisation des choix temporaires. Le bouton Refaire revient à la capture. Le bouton Réinitialiser remet filtres, accessoires, animations, variante et choix temporaires aux valeurs par défaut.

## Écran de veille et capture

L’écran de veille doit réutiliser les GIF et animations déjà disponibles. Après inactivité, une animation légère, un blur et un texte ou indice invitent à toucher. Un toucher réveille directement la borne, sans écran intermédiaire inutile.

La capture doit proposer plusieurs flashs réellement fonctionnels : blanc, doux, chaud, coloré et désactivé, avec intensité et durée réglables. Le mode portrait est sélectionné par défaut lorsqu’il est disponible, mais peut être désactivé dans les réglages.

Pendant une série de plusieurs prises, afficher une bande verticale de miniatures sur la gauche. Avec une seule photo, cette bande est cachée. Une miniature peut être sélectionnée, supprimée ou refaite. La série complète reste sélectionnée par défaut pour l’export.

## Quatre formats unifiés

Chaque prise doit être modélisée comme un pack unique comprenant les versions disponibles :

| Version | Règle |
|---|---|
| Original | Photo sans filtre ni modification créative, toujours conservée. |
| Version choisie | Photo avec le filtre couleur, accessoire visage ou aucun effet choisi. |
| Portrait | Version portrait, activée par défaut si disponible. |
| GIF | Version animée issue de la série ou du mini-clip, activable. |

Sur l’écran Résultat, afficher d’abord une image fixe nette et immédiate. Après un délai configurable, le GIF remplace l’image fixe par un fondu sans clignotement. L’audio du GIF est activable ou désactivable, silencieux par défaut si l’autoplay est bloqué, avec bouton de son configurable et version silencieuse toujours disponible.

Sous l’aperçu, afficher uniquement les boutons de variantes réellement disponibles : Original, Filtré, Portrait et GIF. Chaque bouton peut être masqué dans les réglages organisateur. Le changement de variante doit être immédiat. Lorsqu’une nouvelle photo est sélectionnée, arrêter le GIF précédent, afficher sa photo fixe, puis lancer son GIF après le délai prévu.

## Carrousel d’effets

Le carrousel couleur doit rester une demi-roue circulaire coupée par le bord droit, comme dans la maquette fournie. Les pastilles doivent être positionnées par angle autour d’un même centre hors écran, et non comme une simple liste verticale ou un carrousel horizontal. Chaque pastille doit afficher une vraie miniature de l’aperçu caméra avec l’effet correspondant. La pastille active est plus grande, lumineuse et bordée discrètement.

Un glissement autour de la roue modifie l’angle et fait tourner réellement les éléments. Un toucher sélectionne immédiatement sans bouton Appliquer. Les filtres couleur, accessoires visage et animations doivent être des packs indépendants et réordonnables dans les réglages. L’organisateur peut activer, désactiver, réordonner et choisir la catégorie affichée en premier.

Les filtres existants doivent être vérifiés un par un : aperçu, export, désactivation, intensité et performance. Ne pas convertir inutilement tous les effets en 3D. Les effets lourds doivent être chargés à la demande.

## Partage et galerie

L’écran de partage doit permettre de choisir une photo ou toute la série, une ou plusieurs variantes, un GIF avec ou sans audio, puis un ou plusieurs destinataires lorsque le canal le permet. Les canaux optionnels sont QR vers une galerie, partage natif, copie de lien, téléchargement local et plateformes présentes sur l’appareil. Le bouton doit être nommé clairement **Galerie**.

Les boutons de partage sont configurables et peuvent être masqués. Les photos doivent être conservées localement avant l’envoi et placées dans une file d’attente si le réseau tombe. Après export, vider les sélections temporaires et revenir automatiquement à l’écran configuré.

## Mode vidéo optionnel

Un mode vidéo souvenir peut être proposé dans les réglages, mais il ne doit jamais ralentir le parcours photo principal. Il doit afficher un indicateur visible, demander les autorisations caméra et micro, avoir une durée maximale, un bouton d’arrêt clair, un stockage local, une commande distante optionnelle et une information sur la conservation des données. L’enregistrement permanent sans indication est interdit.

## Réglages organisateur et éditeur d’interface

Créer des presets tels que Anniversaire, Mariage, Soirée et Personnalisé. Ajouter un diagnostic de borne indiquant caméra connectée, flux reçu, réseau, stockage, dernière photo sauvegardée, file d’envoi et état QR. Ajouter une calibration guidée initiale pour orientation, cadrage, luminosité, flash et connexion.

Créer un aperçu de configuration sous forme de fausse tablette interactive. L’organisateur peut cliquer sur chaque composant, modifier son texte, sa visibilité, sa taille, sa position, son ordre, sa couleur, son thème, son fond et le dock. Le lien de dons doit pouvoir être désactivé. Les réglages techniques restent cachés aux invités.

Prévoir les thèmes sombre, Liquid Glass et Glassmorphism. L’organisateur peut choisir la couleur principale, la couleur d’accent, le flou, la transparence, la bordure et l’ombre. L’interface doit rester lisible sur petit écran.

## Petits écrans et performance

Ne pas réduire toute l’interface quand l’écran est petit. Simplifier l’écran et agrandir les éléments essentiels. Priorité : aperçu caméra, demi-roue, action capture, statut puis réglages secondaires. Aucun popup ne doit être positionné dans un écran inexistant, un conteneur masqué ou une ancienne hauteur de viewport.

Utiliser le stockage local ou IndexedDB pour préférences, assets, états temporaires et photos en attente. Utiliser Modal pour pairage, signaling, galerie, QR et synchronisation nécessaire, mais pas pour chaque interaction ou chaque effet. Nettoyer les pistes caméra, GIF, audio, timers et WebRTC en quittant un écran.

## Tests et livraison

Tester les trois modes, le choix direct sans Continuer, le bouton photo désactivé puis activé, la capture au clic désactivée puis activée, le nombre de photos configurable, le compteur et le délai sans compteur, les séries de 1 à 6, les quatre formats, la transition fixe vers GIF, l’audio, les boutons de variantes, le partage multiple, la bande conditionnelle, Refaire, Réinitialiser, les thèmes, les petits écrans, les popups, les coupures réseau, la reconnexion, le retour veille, le mode vidéo optionnel et le verrouillage caméra.

Livrer la liste exacte des fichiers modifiés, les tests exécutés, la matrice des réglages et valeurs par défaut, la documentation des modes, la procédure iPhone 11/tablette Huawei, les limites nécessitant une recette physique et le guide Modal. Ne jamais déclarer une fonction terminée parce que son bouton existe : elle est terminée uniquement si son action, son état de chargement, son erreur et son retour sont fonctionnels.

Ne déployer ni supprimer une ancienne version sans confirmation explicite.
