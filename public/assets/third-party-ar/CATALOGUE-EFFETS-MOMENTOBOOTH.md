# Catalogue des effets MomentoBooth — version actuelle auditée

## Périmètre

Ce catalogue décrit la version présente dans `/home/ubuntu/momentobooth_audit/claude-v118-audit`, issue de l’archive fournie comme dernière version actuelle. Il distingue les effets réellement déclarés dans les registres et ceux effectivement dessinés par le runtime.

## 1. Filtres photo couleur

Le registre `public/js/filters.js` expose 14 looks photo :

| Identifiant | Nom affiché | Nature |
|---|---|---|
| `original` | Original | Aucun traitement couleur. |
| `studio` | Studio | Contraste, saturation et luminosité légèrement renforcés. |
| `clean` | Clean | Rendu clair et naturel avec légère teinte blanche. |
| `golden` | Golden Hour | Teinte dorée, saturation, vignette et contraste. |
| `rose` | Rose | Teinte rose et légère rotation de teinte. |
| `ice` | Ice | Teinte froide bleutée. |
| `cinema` | Cinéma | Contraste cinématographique, teinte sombre et vignette. |
| `film` | Film | Teinte chaude, grain léger et vignette. |
| `soft` | Soft | Luminosité douce et contraste réduit. |
| `barbie` | Barbie | Saturation rose vive et teinte magenta. |
| `party` | Party | Saturation forte, teinte rose et grain léger. |
| `mono` | N&B | Noir et blanc avec contraste modéré et grain. |
| `noir` | Noir | Noir et blanc plus contrasté, vignette et grain. |

Le moteur pixel prend en charge `grayscale`, `sepia`, `contrast`, `brightness`, `saturate`, `hueRotate`, `tint`, `vignette` et `grain`. Les anciens identifiants CSSgram sont conservés sous forme d’alias de compatibilité, mais ils redirigent vers les looks actuels.

## 2. Accessoires faciaux et masques

Le registre `public/js/filters.js` expose 16 accessoires et `public/js/masks.js` contient bien un drawer de rendu pour chacun d’eux :

| Identifiant | Nom affiché | Rendu réel |
|---|---|---|
| `crown` | La Reine | Couronne dorée avec gemmes et rotation de tête. |
| `glasses` | Lunettes | Lunettes sombres avec reflets et branches. |
| `poopin` | Tête de caca | Forme brune stylisée avec yeux, sourire et joues. |
| `cowboy` | Cowboy | Chapeau western avec bandeau et étoile. |
| `copin` | Copin | Lunettes miroir avec sourire en coin. |
| `copine` | Copine | Lèvres glossy roses avec reflet. |
| `family` | Famille Verpoort | Couronne, cœurs de joues et texte/éléments familiaux. |
| `mustache` | Moustache | Moustache positionnée autour de la bouche. |
| `halo` | Ange | Halo au-dessus de la tête. |
| `cat` | Oreilles de chat | Oreilles et éléments de chat. |
| `bear` | Oreilles d’ours | Oreilles et visage d’ours stylisé. |
| `catnose` | Museau chat | Museau et moustaches de chat. |
| `horns` | Cornes | Deux cornes rouges. |
| `antennas` | Antennes | Antennes avec boules colorées. |
| `bunny` | Lapin | Grandes oreilles et museau de lapin. |
| `starry` | Yeux étoilés | Étoiles positionnées sur la zone des yeux. |

Ces accessoires sont dessinés en Canvas 2D à partir des landmarks MediaPipe. Ils ne sont pas des modèles 3D et ne nécessitent pas WebGL. Leur avantage est la légèreté ; leur limite est un rendu moins volumétrique qu’un véritable asset 3D PBR.

## 3. Animations décoratives en direct

Le registre `public/js/animations.js` expose 9 choix, dont l’état neutre :

| Identifiant | Nom affiché | Type de particules |
|---|---|---|
| `none` | Aucune | Désactivation. |
| `balloons` | Ballons | Ballons volumétriques avec ficelles et reflets. |
| `confetti` | Confettis | Rectangles colorés tombants. |
| `hearts` | Cœurs | Cœurs flottants. |
| `stars` | Étoiles | Étoiles scintillantes. |
| `petals` | Pétales | Pétales flottants. |
| `bubbles` | Bulles | Bulles cerclées avec reflet. |
| `sparkles` | Magie | Étoiles à quatre branches pulsées. |
| `snow` | Neige | Flocons ronds descendants. |

Le moteur utilise un seul `requestAnimationFrame`, mais limite le dessin décoratif à environ 15 images par seconde afin de limiter la chauffe et la pression GPU de l’iPhone.

## 4. Cadres photo

Le registre `public/js/frames.js` expose 8 cadres :

| Identifiant | Nom affiché | Design |
|---|---|---|
| `none` | Aucun | Photo sans cadre. |
| `barbie` | Barbie | Bordure rose, filet doré, paillettes et ruban. |
| `gold` | Doré | Double filet doré et ruban central. |
| `confetti` | Confettis | Confettis colorés sur les bords et ruban. |
| `balloons` | Ballons | Six ballons en haut et ruban. |
| `hearts` | Cœurs | Bordure de cœurs et ruban. |
| `floral` | Floral | Fleurs dans les coins et filet élégant. |
| `stars` | Étoiles | Bordure d’étoiles dorées et ruban. |
| `party` | Fête | Rayures diagonales colorées et ruban. |

## 5. Variantes générées par une prise

Le pipeline de capture documente quatre sorties possibles à partir d’une même image :

| Variante | Condition | Description |
|---|---|---|
| Original | Toujours | Photo sans filtre couleur, avec les accessoires choisis. |
| Filtre | Look couleur différent de `original` | Même prise avec le filtre photo choisi. |
| Portrait | Mode portrait/auto et visage disponible ou fallback | Flou d’arrière-plan local ou serveur. |
| GIF | Capture animée activée | Animation et accessoires en mouvement. |

## 6. Médias de veille et tutoriels

| Fichier | Usage |
|---|---|
| `public/img/idle-click.gif` | Animation de toucher sur l’écran de veille. |
| `public/img/idle-swipe.gif` | Animation indiquant le geste de balayage. |
| `public/img/tuto-swipe-1.png` | Tutoriel de balayage, étape 1. |
| `public/img/tuto-swipe-2.png` | Tutoriel de balayage, étape 2. |
| `public/mediapipe/face_landmarker.task` | Modèle local MediaPipe, environ 3,8 Mo. |
| `public/mediapipe/vision_bundle.mjs` | Bundle de vision local. |

La veille possède aussi un carrousel de scènes HTML/CSS et revient à la scène du GIF de toucher avant de jouer l’animation, afin de ne pas lancer une animation cachée derrière une autre scène.

## 7. Assets 3D externes préparés

| Asset | Emplacement | Licence | État |
|---|---|---|---|
| NoelCap | `third-party-ar/noel-cap/NoelCap.glb` | CC0 | Asset très léger, mais orientation brute à corriger pour le visage. |
| Lunettes MindAR | `third-party-ar/mindar-glasses/scene.gltf` + `scene.bin` | CC BY 4.0 | Asset très léger, attribution à conserver. |

Ces assets 3D sont des candidats d’essai. Ils ne remplacent pas encore les masques Canvas existants tant que leur placement, leur orientation, leur rendu et leur stabilité n’ont pas été validés sur un visage réel.

## Décision de travail

Le meilleur candidat pour un premier essai 3D facial est **les lunettes MindAR**, car l’objet est nativement conçu pour un exemple de face tracking, très léger et directement positionnable entre les deux yeux. La casquette NoelCap sera traitée ensuite comme accessoire de sommet de tête, mais son orientation et son ancrage sont moins immédiats.

Le premier essai doit préserver le drawer Canvas `glasses` original, ajouter une variante 3D séparée et permettre de revenir à l’original sans perte. Chaque modification doit être faite dans une copie versionnée de l’asset, avec un fichier de notices de licence conservé.

## Essais de rendu 3D

Des planches multi-angles ont été produites dans `third-party-ar/turntable-previews/` pour les lunettes originales, une variante rose/cyan et la casquette originale. Les vues frontale, trois-quarts, latérale et arrière confirment que les fichiers sont bien des maillages 3D, avec des volumes et des branches visibles selon l’angle. La variante rose/cyan est une copie séparée de `scene.gltf` ; l’original et son `scene.bin` n’ont pas été modifiés. Le modèle de lunettes reste cependant très géométrique et minimal : il est adapté à un prototype léger, mais pas encore au niveau visuel d’un filtre Snapchat haut de gamme.
