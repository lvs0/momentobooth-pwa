# Matrice de personnalisation des effets MomentoBooth

## Filtres couleur

Les looks sont définis dans `public/js/filters.js`, dans le tableau `PRO_LOOKS`. Ils sont facilement modifiables sans changer le pipeline de capture.

| Paramètre | Modifiable | Emplacement | Impact |
|---|---|---|---|
| Nom affiché | Oui | `PRO_LOOKS[].name` | Interface seulement. |
| Identifiant | Oui avec migration | `PRO_LOOKS[].id` et alias | Compatibilité des préférences. |
| CSS live | Oui | `PRO_LOOKS[].css` | Aperçu vidéo immédiat. |
| Opérations export | Oui | `PRO_LOOKS[].ops` | Résultat JPEG/GIF. |
| Teinte | Oui | opération `tint` | Couleur globale légère. |
| Saturation | Oui | `saturate` | Intensité des couleurs. |
| Contraste | Oui | `contrast` | Profondeur de l’image. |
| Luminosité | Oui | `brightness` | Exposition perçue. |
| Noir et blanc | Oui | `grayscale` | Conversion monochrome. |
| Sépia | Oui | `sepia` | Ambiance vintage. |
| Rotation de teinte | Oui | `hueRotate` | Décalage chromatique. |
| Vignette | Oui | `overlay.vignette` ou ops | Mise en valeur du visage. |
| Grain | Oui | `overlay.grain` ou ops | Texture film, à limiter sur iPhone. |

Le bon fonctionnement exige que le CSS live et `ops` restent cohérents. Une modification doit donc toujours être faite dans les deux représentations.

## Accessoires Canvas

Les accessoires sont définis dans `public/js/filters.js` et dessinés par `public/js/masks.js`.

| Paramètre | Modifiable | Méthode |
|---|---|---|
| Couleurs | Oui | Modifier les couleurs des dégradés, traits et remplissages Canvas/SVG. |
| Taille | Oui | Modifier les coefficients liés à `headW`, `eyeDist` ou `faceH`. |
| Position | Oui | Modifier les offsets autour du nez, front, yeux, oreilles ou menton. |
| Rotation | Oui | Utiliser `headAngle(face)` ou une correction d’angle. |
| Épaisseur/ombres | Oui | Modifier `lineWidth`, `shadowBlur`, alpha et gradients. |
| Texte | Oui pour `family` | Modifier les libellés et les appels `drawEmoji`. |
| Déclencheur expression | Partiellement | Ajouter un seuil sourire, bouche ouverte, clignement ou sourcil. |
| Asset image externe | Oui | Ajouter une texture Canvas ou un plan 2D ancré. |
| Asset 3D | Pas dans le renderer actuel | Demande une couche WebGL/glTF séparée. |

## Animations décoratives

Les animations sont définies dans `public/js/animations.js`, dans `ANIMATIONS` et `CONFIG`.

| Paramètre | Modifiable | Méthode |
|---|---|---|
| Nom et icône | Oui | Modifier `ANIMATIONS`. |
| Nombre de particules | Oui | Modifier `CONFIG[id].count`. |
| Palette | Oui | Modifier `CONFIG[id].palette`. |
| Vitesse verticale | Oui | Modifier `vy`. |
| Oscillation | Oui | Modifier `sway`. |
| Taille | Oui | Modifier `size`. |
| Forme | Oui | Ajouter une branche dans `drawParticle`. |
| Gravité/direction | Oui | Modifier `step()`. |
| Fréquence de rendu | Oui | Modifier `ANIMATION_INTERVAL_MS`, à mesurer. |
| Déclenchement expression | À ajouter | Brancher un événement de tracker, pas une boucle lourde. |
| Texte animé | À ajouter | Préférer Canvas ou DOM pour le texte, sans générer une vidéo. |
| GIF exporté | Oui indirectement | Le moteur capture les frames après application de l’animation. |

## Cadres photo

Les cadres sont définis dans `public/js/frames.js`.

| Paramètre | Modifiable | Méthode |
|---|---|---|
| Texte principal | Oui | `FRAME_TEXTS` et panneau organisateur. |
| Sous-texte | Oui | `FRAME_TEXTS`. |
| Couleurs | Oui | Variables de chaque design. |
| Ruban | Oui | `drawRibbon`. |
| Bordure | Oui | `strokeRect`, formes et épaisseurs. |
| Densité de confettis | Oui | Nombre d’éléments. |
| Position des décorations | Oui | Boucles et coordonnées de dessin. |
| Nouveau cadre | Oui | Ajouter une entrée dans `DESIGNS` et `framePreview`. |

## Familles Lens à reproduire

| Famille publique | Équivalent MomentoBooth actuel | Priorité |
|---|---|---:|
| Face retouch | Non disponible comme module dédié | Moyenne. |
| Couleur des yeux | Non disponible | Basse pour un anniversaire. |
| Face mask texture | Accessoires Canvas partiels | Haute. |
| Attachment 2D | SVG/Canvas accessoires | Haute. |
| Attachment 3D | Prototype externe, pas intégré | Haute mais après stabilité. |
| Face mesh | MediaPipe local présent | Haute. |
| Face landmarks | MediaPipe local présent | Haute. |
| Expressions | Tracker présent, déclencheurs à formaliser | Haute. |
| Eye tracking | Landmarks yeux disponibles | Moyenne. |
| Liquify/stretch | Non disponible | Basse, risque de déformation. |
| Animation par bouche/sourire | Non systématisée | Moyenne. |

## Règle de personnalisation

Toute modification d’un effet doit produire un identifiant ou une version, conserver le rendu précédent dans une copie et être testée sur : visage immobile, rotation gauche/droite, mouvement vertical, absence temporaire de visage, lumière faible et capture finale. Une animation ne doit jamais augmenter la charge du parcours principal au point de ralentir l’aperçu ou la capture.
