# Recherche — architecture de filtres Lens légers

## Conclusion courte

Il n’existe pas de recette publique permettant de reproduire exactement le moteur propriétaire de Snapchat. En revanche, les briques publiques nécessaires à une architecture équivalente sont connues : suivi facial local, landmarks/blendshapes, matrices de transformation, rendu GPU, assets glTF optimisés, déclencheurs d’expression et dégradation selon le matériel.

## Ce que fournit MediaPipe Face Landmarker

La documentation officielle Google indique que Face Landmarker produit un maillage facial 3D, des scores de blendshapes et des matrices de transformation pour appliquer des effets. Le bundle officiel combine détection, maillage et prédiction d’expressions ; il fournit jusqu’à 478 landmarks et 52 coefficients d’expression. Le mode `LIVE_STREAM`, le lissage avec un seul visage, la matrice faciale et les scores de confiance sont directement pertinents pour une application de photobooth [1].

## Ce que montre une bibliothèque légère comme Jeeliz

Jeeliz se présente comme une bibliothèque WebGL/JavaScript légère et indépendante d’un moteur 3D. Elle fournit des résultats bruts — détection, position, échelle, rotation et ouverture de bouche — afin de laisser l’application choisir entre Canvas 2D, CSS 3D, Three.js ou Babylon.js. Cette séparation est une bonne stratégie pour MomentoBooth : le tracking ne doit pas être couplé à tous les assets et le moteur doit pouvoir désactiver un filtre sans redémarrer la caméra [2].

## Techniques publiques de Lens Studio réutilisables

La documentation Snap recommande de viser environ 30 FPS et de rester au-dessus de 15 FPS sur la majorité des appareils, de limiter la mémoire et la taille téléchargée, de réduire les vertex, d’utiliser des matériaux simples, de limiter les composants ML, de réduire les particules, d’éviter les graphes de shader complexes et de charger les parties d’un effet uniquement lorsqu’elles sont nécessaires. Elle recommande également de limiter le nombre d’objets et de render targets, d’utiliser une compression de textures adaptée et de privilégier les animations simples [3].

Snap documente plusieurs familles d’effets : retouche de peau, couleur des yeux, liquify, stretch, inset, masque de texture, attachement 2D, attachement 3D, face mesh, landmarks, expressions, suivi des yeux, texture visage et déclencheurs bouche/sourire/sourcils/baiser [4]. Ces catégories correspondent à une matrice que MomentBooth peut reproduire sans copier le logiciel propriétaire.

## Optimisation des assets 3D

Khronos présente glTF comme un format de livraison adapté aux scènes 3D et documente l’extension Draco pour compresser la géométrie. Draco compresse notamment positions, connectivité, coordonnées UV, couleurs et normales ; la documentation cite des réductions pouvant atteindre environ 12 fois sur certains modèles sans changement visuel notable [5]. Pour MomentBooth, il faut tester la décompression sur Safari iPhone avant d’en faire une obligation : un fichier plus petit peut coûter du temps CPU au chargement.

Les recommandations MDN WebGL convergent avec cette approche : réduire le back buffer si nécessaire, réutiliser les buffers et textures, limiter les draw calls, utiliser les mipmaps pour les textures 3D, préférer des shaders simples, surveiller la mémoire vidéo et éviter les appels synchrones bloquants dans la boucle de rendu [6].

## Méthode reproductible pour MomentoBooth

1. Le flux caméra reste local à l’iPhone.
2. MediaPipe tourne en mode LIVE_STREAM, avec un seul visage en priorité pour obtenir le lissage.
3. Le tracker produit une pose faciale stabilisée, des landmarks sélectionnés et des expressions utiles.
4. Les effets sont classés en Canvas 2D, texture/mesh 2D, modèle 3D léger ou shader.
5. Chaque effet possède un budget : poids téléchargé, triangles, textures, draw calls, fréquence de mise à jour et consommation mémoire.
6. Les accessoires simples sont mis à jour à chaque résultat de tracking ; les décorations peuvent être mises à jour à 15–30 Hz.
7. Les expressions déclenchent les animations uniquement lorsqu’un seuil est franchi, au lieu de recalculer toute la logique à chaque frame.
8. Si le GPU ou le tracker devient lent, l’application réduit la résolution de rendu, désactive les particules et revient au Canvas 2D.
9. Un filtre n’est déclaré prêt qu’après mesure sur l’iPhone 11 et la tablette cible.

## Ce qui est déjà présent dans MomentBooth

MomentBooth possède déjà un maillage MediaPipe local, des masques Canvas 2D, des filtres pixel/CSS, des animations à une boucle RAF limitée à environ 15 FPS, des captures Original/Filtre/Portrait/GIF et une séparation entre filtre couleur et accessoire. Il manque principalement une couche d’assets 3D optimisés avec ancrages normalisés, un budget par effet, une vraie boucle WebGL optionnelle et une matrice de déclencheurs d’expressions.

## Limites honnêtes

Un filtre de photomaton peut reproduire les mêmes principes techniques qu’un Lens moderne, mais il ne peut pas être déclaré « exactement Snapchat » sans le moteur, les données et les outils propriétaires correspondants. Le bon objectif est une expérience de qualité comparable sur un nombre volontairement limité d’effets, avec des assets originaux, des budgets mesurés et une dégradation maîtrisée.

## Références

[1]: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker "Google AI Edge — Face Landmarker"
[2]: https://github.com/jeeliz/jeelizFaceFilter "Jeeliz FaceFilter — bibliothèque WebGL légère"
[3]: https://developers.snap.com/lens-studio/publishing/optimization/performance-optimization-guide "Snap for Developers — Performance and Optimization for Lenses"
[4]: https://developers.snap.com/lens-studio/features/ar-tracking/face/face-effects-overview "Snap for Developers — Face Effects Overview"
[5]: https://www.khronos.org/news/press/khronos-announces-gltf-geometry-compression-extension-google-draco "Khronos — glTF Geometry Compression with Draco"
[6]: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices "MDN — WebGL best practices"
