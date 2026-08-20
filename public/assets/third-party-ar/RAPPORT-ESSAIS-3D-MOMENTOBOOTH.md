# Rapport d’essais 3D MomentoBooth

## Résultat visuel

Les premiers aperçus en vue unique ne permettaient pas de discerner correctement le volume. Des planches multi-angles ont donc été générées pour chaque asset : face, trois-quarts, côté et arrière.

| Asset | Planche |
|---|---|
| Lunettes MindAR originales | `third-party-ar/turntable-previews/glasses-original-turntable-sheet.png` |
| Lunettes MindAR variante rose/cyan | `third-party-ar/turntable-previews/glasses-rose-turntable-sheet.png` |
| NoelCap originale | `third-party-ar/turntable-previews/noelcap-original-turntable-sheet.png` |

## Copies et modifications

Les fichiers sources n’ont pas été modifiés. L’original des lunettes reste dans `third-party-ar/mindar-glasses/scene.gltf` avec son `scene.bin`. Une copie séparée a été créée dans `third-party-ar/variants/mindar-glasses-rose.gltf`, avec son propre `scene.bin`. Cette variante change la couleur des matériaux vers un rendu cyan/rose et augmente l’échelle à 108 %.

La casquette originale reste dans `third-party-ar/noel-cap/NoelCap.glb`. Elle n’a pas encore été transformée directement, car son orientation et son axe d’ancrage doivent être définis à partir du tracking facial réel ; une rotation aveugle dans le fichier risquerait de rendre l’asset inutilisable.

## Évaluation

Les lunettes sont le meilleur premier candidat pour une intégration 3D faciale : elles sont légères, leur point d’ancrage entre les yeux est naturel et leur modèle vient d’un exemple de face tracking. Toutefois, leur géométrie est très simple et leur silhouette reste celle d’une monture rectangulaire basique.

La casquette possède un volume visible en vue trois-quarts et latérale, mais sa forme basse et polygonale n’évoque pas encore clairement une casquette de fête haut de gamme. Elle peut servir de prototype d’ancrage tête, mais elle ne doit pas remplacer immédiatement la couronne Canvas existante, qui est actuellement plus lisible et plus décorative.

## Limite de génération de mockups

Une tentative de génération de visuels réalistes montrant les modèles portés sur un visage a été préparée avec les rendus comme références, mais le quota quotidien gratuit du générateur visuel est atteint. Les planches multi-angles déterministes livrées ici représentent fidèlement les fichiers 3D ; les futurs mockups sur visage devront être considérés comme des visuels de présentation et non comme une preuve de compatibilité AR.

## Catalogue principal

Le catalogue complet des filtres couleur, accessoires Canvas, animations, cadres, variantes de capture, médias de veille et licences se trouve dans `CATALOGUE-EFFETS-MOMENTOBOOTH.md`.
