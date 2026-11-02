<p align="center"><img src="icon.png" width="128" alt="VTLOdr3m3r"></p>

# VTLOdr3m3r — Opération Lightning (Android)

Application Android hors ligne, **100 % en français**, qui embarque le rapport *OPERATION LIGHTNING — GNSS Interference Intelligence*
(« Traquer Молния », source : arXiv 2606.03673) avec une mise en page mobile, des effets visuels avancés et une **lecture audio**.
`#by VTLO@xda` · PROJECT S3CR3T · Copyleft — tous les torts réservés.

## Fonctionnalités
- Page complète traduite en français (textes, tableaux, journal TDOA, étiquettes des graphiques, séquence de lancement) ; polices embarquées, **aucune permission Internet**
- **Lecteur audio** : bouton flottant, lecture bloc par bloc de la page active avec surlignage et défilement automatique, précédent/suivant, vitesse (0,85× à 1,3×), choix de la voix, enchaînement automatique des pages (AUTO)
  - Android : moteur de synthèse vocale du téléphone (fr-FR), voix féminine privilégiée si identifiable ; si la voix française n'est pas installée, l'app propose de l'installer
  - Normalisation pour la parole (MHz → mégahertz, dB → décibels, sigles épelés, lettres grecques, symboles…)
- Mise en page mobile : barre de navigation en bas, zones sûres/encoche, bouton retour → Aperçu → quitter
- Fond d'orage WebGL réagissant à l'inclinaison, éclairs, arcs électriques au toucher, transitions animées, compteurs, spectre en direct, orbite Molniya (mouvement képlérien)
- Vibrations synchronisées avec les éclairs (permission VIBRATE uniquement)
- Signature VTLO mise en valeur dans l'en-tête et le pied de page de chaque page

> Les images matricielles (cartes de chaleur, histogrammes) contiennent du texte en anglais intégré aux pixels : elles ne sont pas traduites.

## Compilation
**Gradle** (Android Studio ou ligne de commande) :
```bash
echo "sdk.dir=/chemin/vers/Android/sdk" > local.properties
./gradlew assembleRelease        # → app/build/outputs/apk/release/app-release.apk
```
**Sans Gradle** (JDK + SDK plateforme 34 / build-tools 34.0.0) :
```bash
ANDROID_HOME=/chemin/vers/sdk ./scripts/build-apk.sh   # → out/VTLOdr3m3r.apk
```
Signature release optionnelle : variables `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` (sinon clé de debug).
GitHub Actions (`.github/workflows/build.yml`) compile l'APK à chaque push ; ajoute les secrets `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` pour une signature release.

## Structure
```
app/src/main/
  java/com/vtlo/lightning/MainActivity.java   WebView, insets, vibrations, inclinaison, retour, synthèse vocale native
  assets/www/index.html                        rapport (traduit ; polices locales, viewport mobile)
  assets/www/mobile.css                        mise en page mobile + styles des effets et du lecteur
  assets/www/fx.js                             orage WebGL, éclairs, transitions, graphiques animés
  assets/www/tts.js                            lecteur audio (extraction des blocs, normalisation, commandes)
  res/                                         icône, écran de démarrage, thème
```
Aperçu navigateur : ouvrir `assets/www/index.html` (ajouter `?nogl` pour désactiver le fond WebGL) ; la lecture utilise alors `speechSynthesis`.
