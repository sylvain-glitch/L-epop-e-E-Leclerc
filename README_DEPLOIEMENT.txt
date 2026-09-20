L’ÉPOPÉE E.LECLERC — APPLICATION MULTIJOUEUR E-WORKS V1

Cette version reprend le même fonctionnement que « Les Rois de la Vente » V7 :
- écran Animateur sur ordinateur ;
- création d’un code de partie ;
- QR code / lien joueur ;
- connexion des participants depuis leur smartphone ;
- réponses en direct ;
- révélation de la bonne réponse par l’animateur ;
- points attribués au joueur le plus rapide parmi les bonnes réponses ;
- classement final ;
- jusqu’à 20 participants.

CONTENU
La banque intégrée contient 60 questions issues du jeu E.Leclerc fourni.

DÉPLOIEMENT GITHUB + RENDER
1. Créer un nouveau dépôt GitHub (ex. epopee-e-leclerc).
2. Déposer à la racine tous les fichiers de ce dossier.
3. Sur Render : New > Web Service > connecter ce dépôt GitHub.
4. Build command : laisser vide.
5. Start command : npm start
6. Runtime : Node.
7. Une fois le service publié, ouvrir : https://VOTRE-ADRESSE.onrender.com/host.html
8. Ce lien peut ensuite être placé dans un raccourci Windows, exactement comme pour Les Rois de la Vente.

TEST LOCAL
- Installer Node.js 18 ou plus récent.
- Ouvrir un terminal dans ce dossier.
- Lancer : npm start
- Animateur : http://localhost:3000/host.html
- Joueur : http://localhost:3000/play.html

E-WORKS — V1 application multijoueur E.Leclerc
