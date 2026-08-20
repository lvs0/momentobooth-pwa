# Recherche Tripo AI — stratégie AR MomentoBooth

Les pages officielles consultées indiquent que Tripo expose désormais une API V3 asynchrone pour text-to-model et image-to-model. La génération renvoie un `task_id`, puis le résultat est interrogé jusqu’au statut `success`. Le modèle GLB est téléchargeable depuis `output.model_url`, dont l’URL expire rapidement et doit donc être téléchargée immédiatement. La documentation mentionne aussi `face_limit`, `smart_low_poly`, `texture`, `pbr`, `compress`, `auto_size` et `export_uv` comme paramètres importants pour un asset web/mobile.

Pour le photobooth, Tripo ne doit pas générer un visage complet animé. Les assets pertinents sont des accessoires statiques et peu complexes : lunettes, couronne, oreilles, masque léger, moustache ou serre-tête. Ils doivent être générés avec une géométrie simple, un nombre de faces limité, des textures standard et un GLB autonome. L’animation du filtre doit rester déterministe côté navigateur : projection des landmarks, position, rotation et échelle lissées par le tracker local.

Le chemin de production recommandé est donc : générer quelques accessoires 3D avec Tripo, télécharger immédiatement les GLB, vérifier leur taille et leur orientation, puis les optimiser avant intégration. L’iPhone 11 ne doit pas charger un catalogue entier : seuls le look choisi et éventuellement le look suivant doivent être préchargés. Les filtres CSS, les overlays PNG et les animations d’écran de veille doivent être conservés lorsqu’ils sont plus rapides et suffisants.

La documentation officielle signale que l’API V2 sera retirée à l’automne 2026 et recommande V3. Toute nouvelle intégration doit donc éviter de construire un appel V2 durable. La clé Tripo ne doit jamais être exposée au navigateur : elle doit rester côté serveur ou être utilisée uniquement dans un script de préparation hors production.

Sources :

- https://developers.tripo3d.ai/en/docs/quick-start
- https://platform.tripo3d.ai/docs/generation
- https://www.tripo3d.ai/tutorials/tripo-ai-export-formats
