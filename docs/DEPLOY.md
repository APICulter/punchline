# Mettre Punchline en production

Ce guide va d'un VPS vierge à un site en HTTPS déployé automatiquement à chaque push sur `main`,
avec des sauvegardes qui survivent à un piratage du serveur. Compte environ une heure la première
fois.

```
ton ordinateur ── git push main ──► GitHub Actions
                                     ├─ CI : syntaxe, CSS, scripts shell, audit npm, secrets,
                                     │        mini-partie réelle contre MongoDB 8
                                     └─ si tout est vert : ssh deploy@VPS <commit>
                                                            │ (cette clé ne peut faire que ça)
VPS Ubuntu 24.04                                            ▼
  nginx (HTTPS, Let's Encrypt) ──► Node « punchline » (systemd) ──► MongoDB (127.0.0.1, mot de passe)
  pare-feu : SSH, 80, 443          déploiement : vérifie /healthz, revient à l'ancienne version si KO
  sauvegarde chaque nuit ──► chiffrée (age) ──► stockage externe non effaçable / autre machine
```

Les détails techniques sont dans [deploy/README-ci.md](../deploy/README-ci.md) (CI/CD) et
[SECURITY.md](../SECURITY.md) (sécurité). Ce guide suffit pour tout mettre en place.

---

## 1. Ce qu'il te faut

- **Un VPS Ubuntu 24.04 LTS** (Debian 12 marche aussi) : 1 vCPU et 2 Go de RAM suffisent
  largement (500 parties simultanées ≈ +35 Mo). Hetzner, OVH, Scaleway… Choisis « Ubuntu 24.04 »
  et ajoute ta clé SSH personnelle à la création.
- **Un nom de domaine** (ex. `punchline.mondomaine.fr`) dont tu peux modifier le DNS.
- **Le dépôt GitHub** `APICulter/punchline`, avec les droits d'admin (pour les secrets).
- Pour les sauvegardes hors serveur : **un compte Backblaze B2** (10 Go gratuits) *ou* une autre
  machine allumée en permanence (NAS, Raspberry Pi, second petit serveur).

## 2. Préparer les clés (sur ton ordinateur)

```bash
# Clé de déploiement pour GitHub Actions : elle ne pourra QUE déployer un commit de main
ssh-keygen -t ed25519 -N "" -C "github-actions-deploy@punchline" -f punchline_deploy

# Clé de chiffrement des sauvegardes : la clé PRIVÉE ne va JAMAIS sur le serveur
sudo apt install age            # macOS : brew install age ; Windows : winget install FiloSottile.age
age-keygen -o punchline-backup-key.txt
# la ligne "Public key: age1…" est la clé publique, à mettre sur le serveur (étape 5)
```

Range `punchline-backup-key.txt` dans ton gestionnaire de mots de passe **et** sur une clé USB :
sans elle, les sauvegardes chiffrées sont illisibles, y compris pour toi.

## 3. DNS

Chez ton registrar, crée un enregistrement `A` (et `AAAA` si le VPS a une IPv6) :
`punchline.mondomaine.fr → adresse IP du VPS`. Vérifie avant de continuer :

```bash
dig +short punchline.mondomaine.fr     # doit afficher l'IP du VPS
```

## 4. Installer le serveur (une commande)

Connecte-toi au VPS (`ssh root@IP` ou ton utilisateur avec sudo), puis :

```bash
curl -fsSLO https://raw.githubusercontent.com/APICulter/punchline/main/deploy/setup-vps.sh

# 1) voir ce qui va être fait, sans rien changer
sudo bash setup-vps.sh --dry-run --domain punchline.mondomaine.fr --email toi@exemple.fr \
  --deploy-key "COLLE ICI le contenu de punchline_deploy.pub" --admin-user arnaud

# 2) pour de vrai
sudo bash setup-vps.sh --domain punchline.mondomaine.fr --email toi@exemple.fr \
  --deploy-key "COLLE ICI le contenu de punchline_deploy.pub" --admin-user arnaud
```

`--admin-user arnaud` n'est utile que si tu te connectes aujourd'hui en `root` : le script crée
`arnaud` (sudo, connexion par clé uniquement) avec tes clés, puis interdit la connexion root et les
mots de passe SSH. **Garde ta session ouverte** et vérifie dans un second terminal que
`ssh arnaud@punchline.mondomaine.fr` puis `sudo -v` fonctionnent avant de fermer la première.

Ce que le script installe et règle :

| | |
| --- | --- |
| Utilisateurs | `punchline` (fait tourner le jeu, pas de shell), `deploy` (GitHub, commande imposée) |
| Logiciels | Node.js 22, MongoDB 8 (local seulement, avec mot de passe), nginx, certbot, outils MongoDB |
| Sécurité | pare-feu ufw (SSH, 80, 443), fail2ban (SSH), mises à jour de sécurité automatiques, SSH par clé uniquement |
| Jeu | code dans `/srv/punchline`, service systemd isolé, HTTPS Let's Encrypt, sauvegarde chaque nuit à 4 h 30 |
| Secrets | `/etc/punchline/punchline.env` (droits 600), mots de passe MongoDB générés au hasard |

Le script peut être relancé autant de fois que nécessaire (il ne refait que ce qui manque). À la
fin il affiche les valeurs à copier dans GitHub, dont `VPS_KNOWN_HOSTS`.

## 5. Régler les secrets du jeu

```bash
cd /srv/punchline
sudo -u punchline npm run --silent admin:password      # tape un mot de passe long (12+ caractères)
sudo nano /etc/punchline/punchline.env
```

Dans `punchline.env`, complète (les guillemets **simples** sont obligatoires autour du hash, il
contient des `$`) :

```bash
ADMIN_USER='arnaud'
ADMIN_PASSWORD_HASH='scrypt$32768$8$1$…'        # la ligne affichée par admin:password
BACKUP_AGE_RECIPIENT='age1…'                     # la clé PUBLIQUE de l'étape 2
# optionnel : génération de questions par IA (mets une limite de dépenses sur la console Anthropic)
# ANTHROPIC_API_KEY='sk-ant-…'
```

Puis :

```bash
sudo systemctl restart punchline
curl -s https://punchline.mondomaine.fr/healthz       # {"status":"ok","mongo":"connected"}
```

Ouvre `https://punchline.mondomaine.fr/admin`, connecte-toi, et dans **Réglages** clique sur
**Générer un nouveau code** premium (l'ancien est visible dans l'historique GitHub).

## 6. Brancher GitHub (déploiement automatique)

Sur GitHub : **Settings → Environments → New environment** → nom : `production`.

1. **Deployment branches** : « Selected branches » → `main`.
2. **Required reviewers** (conseillé) : ajoute-toi. Chaque mise en production attendra ton clic
   « Approve » dans l'onglet Actions. Sans ça, tout push vert sur `main` part en production.
3. **Environment secrets** :

   | Secret | Valeur |
   | --- | --- |
   | `VPS_HOST` | `punchline.mondomaine.fr` |
   | `VPS_SSH_KEY` | tout le contenu de `punchline_deploy` (la clé **privée**, lignes BEGIN/END comprises) |
   | `VPS_KNOWN_HOSTS` | les lignes affichées à la fin de `setup-vps.sh` |
   | `VPS_PORT` | seulement si SSH n'écoute pas sur 22 |

4. **Environment variables** (facultatif) : `PUBLIC_URL` = `https://punchline.mondomaine.fr`
   (GitHub vérifie alors le site depuis l'extérieur après chaque déploiement).
5. Supprime la clé privée de ton ordinateur : `rm punchline_deploy`.
6. **Settings → Branches → Add rule** sur `main` : exige les deux contrôles de CI (« Checks… » et
   « Smoke test… ») avant de fusionner.

Tant que ces secrets ne sont pas définis, le workflow de déploiement se contente de signaler
« Deploy skipped » (en vert) : tu peux pousser sur `main` avant d'avoir le serveur.

**Test** : fais un petit commit sur `main` (ou *Actions → Deploy → Run workflow*). Dans Actions,
CI puis Deploy doivent passer au vert.

## 7. Au quotidien

| Je veux… | Comment |
| --- | --- |
| Mettre en ligne | `git push` sur `main` (ou fusionner une PR). CI → (ton approbation) → déploiement |
| Revenir en arrière | *Actions → Deploy → Run workflow* avec le SHA d'un bon commit, ou sur le VPS : `sudo /usr/local/lib/punchline/deploy.sh --rollback` |
| Savoir ce qui tourne | `sudo /usr/local/lib/punchline/deploy.sh --status` |
| Voir les logs du jeu | `journalctl -u punchline -f` |
| Voir les déploiements | `sudo tail -f /var/log/punchline-deploy.log` |
| Redémarrer | `sudo systemctl restart punchline` (les parties en cours sont sauvegardées et reprennent) |
| Modifier `deploy/*.sh`, l'unité systemd ou nginx | pousse, puis relance `sudo bash /srv/punchline/deploy/setup-vps.sh …` (mêmes options) : ce qui tourne en root est une copie hors du dépôt, exprès |
| Changer un réglage du jeu (`config.properties`) | `sudo nano /etc/punchline/config.properties` puis redémarrer |

Un déploiement dont le jeu ne répond pas dans les 30 s revient tout seul à la version précédente ;
le run GitHub passe alors au rouge.

Mises à jour : Ubuntu installe seul les correctifs de sécurité. Redémarre le VPS de temps en
temps (`sudo reboot`) quand `/var/run/reboot-required` existe. Dependabot ouvre des PR pour les
dépendances : la CI les teste, il suffit de les fusionner.

## 8. Sauvegardes, y compris si le serveur est piraté

### Le principe

Un pirate qui prend le contrôle du VPS peut effacer tout ce que le VPS a le droit d'effacer :
les sauvegardes locales ne protègent que contre une erreur de manipulation. Les copies qui
comptent sont donc :

1. **chiffrées** (`age`, clé publique sur le serveur, clé privée chez toi) : une sauvegarde volée
   est illisible ;
2. **hors du serveur, là où le serveur ne peut ni supprimer ni écraser** : soit un stockage avec
   verrouillage (Backblaze B2 *Object Lock*), soit une autre machine qui vient les chercher
   elle-même ;
3. **surveillées** : si elles s'arrêtent, tu reçois une alerte ;
4. **testées** : une sauvegarde jamais restaurée n'est qu'un espoir.

Ce qui est sauvegardé : questions, code premium, historique admin, questions supprimées. Pas les
parties en cours (reconstruites) ni les sessions admin. Chaque nuit à 4 h 30, 14 sauvegardes
quotidiennes et 8 hebdomadaires gardées sur le VPS (`/var/backups/punchline`).

### Option A : Backblaze B2 avec verrouillage (recommandée, ~0 €)

1. Sur backblaze.com → B2 → **Create a Bucket** : nom `punchline-backups-xxxx`, *Private*,
   **Object Lock : Enable**, *Default Retention* : **Compliance**, **30 jours**. Pendant 30 jours,
   personne (ni toi, ni un pirate, ni Backblaze) ne peut supprimer une sauvegarde envoyée.
   Dans *Lifecycle Settings*, choisis *Use custom lifecycle rules* : cacher les fichiers 90 jours
   après leur envoi (*daysFromUploadingToHiding* = 90) et les supprimer 1 jour après
   (*daysFromHidingToDeleting* = 1), pour ne pas stocker indéfiniment. Le verrou de 30 jours
   reste prioritaire.
2. Crée une clé limitée à ce bucket, **sans droit de suppression**, avec la [CLI B2](https://www.backblaze.com/docs/cloud-storage-command-line-tools)
   (l'interface web ne permet pas de choisir ces droits un par un) :
   ```bash
   b2 account authorize          # avec ta clé « master », sur ton ordinateur
   b2 key create --bucket punchline-backups-xxxx punchline-vps listBuckets,listFiles,readFiles,writeFiles
   # (ancienne CLI : b2 create-key …) → note keyID et applicationKey
   ```
   Pas de `deleteFiles`, pas de `bypassGovernance`, pas de `writeFileRetentions`.
3. Sur le VPS :
   ```bash
   # rclone est installé par setup-vps.sh ; sa configuration reste hors du code, lisible par le seul service
   sudo rclone --config /etc/punchline/rclone.conf config create b2-backup b2 \
     account KEYID key APPLICATIONKEY hard_delete false
   sudo chown punchline: /etc/punchline/rclone.conf && sudo chmod 600 /etc/punchline/rclone.conf
   printf "%s\n" "RCLONE_CONFIG='/etc/punchline/rclone.conf'" \
     "BACKUP_RCLONE_REMOTE='b2-backup:punchline-backups-xxxx/punchline'" | sudo tee -a /etc/punchline/punchline.env
   sudo systemctl start punchline-backup.service && journalctl -u punchline-backup.service -n 20
   ```
   Le script n'envoie que de nouveaux fichiers et ne remplace jamais un fichier déjà envoyé
   (`rclone copy --ignore-existing`). Avec le verrouillage, même un pirate qui vole cette clé ne
   peut rien effacer pendant 30 jours.

### Option B : une autre machine vient chercher les sauvegardes

Pratique si tu as un NAS ou un Raspberry Pi. Le VPS ne possède aucun accès à cette machine ; elle
seule a une clé qui ne permet que de **lire** le dossier de sauvegardes. Toutes les étapes sont en
tête de [deploy/backup-pull.sh](../deploy/backup-pull.sh) (une clé SSH, une ligne
`authorized_keys` en lecture seule sur le VPS, une ligne cron). Les copies déjà récupérées ne sont
jamais remplacées ni supprimées, et le script signale si la dernière sauvegarde a plus de 2 jours.

Les deux options se cumulent très bien.

### Être prévenu si les sauvegardes s'arrêtent

Crée un check gratuit sur [healthchecks.io](https://healthchecks.io) (période 1 jour, grâce 2 h),
puis :

```bash
echo "BACKUP_PING_URL='https://hc-ping.com/TON-UUID'" | sudo tee -a /etc/punchline/punchline.env
```

Tu recevras un e-mail si une nuit se passe sans sauvegarde réussie.

### Restaurer une sauvegarde

1. Récupère une archive `punchline-AAAA-MM-JJ_HHMM.gz.age` : sur le VPS
   (`/var/backups/punchline/daily/`), sur B2 (`rclone --config /etc/punchline/rclone.conf copy
   b2-backup:punchline-backups-xxxx/punchline/daily/punchline-….gz.age .`) ou sur le NAS.
2. Déchiffre-la **sur ton ordinateur**, là où est la clé privée, puis renvoie le fichier déchiffré
   sur le VPS :
   ```bash
   age -d -i punchline-backup-key.txt punchline-2026-10-31_0430.gz.age > punchline.gz
   scp punchline.gz arnaud@punchline.mondomaine.fr:/tmp/
   ```
3. Sur le VPS, avec le compte administrateur MongoDB (identifiants dans
   `/etc/punchline/mongodb-admin.env`, lisible par root seulement) :
   ```bash
   # l'examiner sans toucher au jeu : restaurée dans une base à part, « punchline_check »
   sudo bash -c '. /etc/punchline/mongodb-admin.env && mongorestore --username "$MONGO_ADMIN_USER" \
     --password "$MONGO_ADMIN_PASSWORD" --authenticationDatabase admin --gzip --archive=/tmp/punchline.gz \
     --nsFrom="punchline.\$c\$" --nsTo="punchline_check.\$c\$"'

   # tout remplacer (le jeu est arrêté pendant l'opération)
   sudo systemctl stop punchline
   sudo bash -c '. /etc/punchline/mongodb-admin.env && mongorestore --username "$MONGO_ADMIN_USER" \
     --password "$MONGO_ADMIN_PASSWORD" --authenticationDatabase admin --gzip --drop --archive=/tmp/punchline.gz'
   sudo systemctl start punchline
   shred -u /tmp/punchline.gz
   ```

**Fais un test de restauration (la commande « l'examiner ») une fois maintenant, puis tous les
quelques mois.**

## 9. Sécurité

### Ce qui est en place

- **Serveur** :
  - seuls SSH, 80 et 443 sont ouverts ;
  - SSH par clé uniquement, sans connexion root, et fail2ban contre les tentatives répétées ;
  - mises à jour de sécurité automatiques.
- **Isolement** :
  - le jeu tourne sous un utilisateur sans droits, dans un service systemd isolé ;
  - Node et MongoDB n'écoutent que sur la machine elle-même, et MongoDB exige un mot de passe ;
  - les secrets ne sont jamais dans git.
- **Déploiement** :
  - la clé GitHub ne peut lancer qu'un seul script, avec un SHA de 40 caractères déjà présent sur
    `main` ;
  - ce script est une copie appartenant à root, qu'aucun commit ne peut modifier ;
  - les dépendances s'installent sans exécuter leurs scripts.
- **Application** (revue de sécurité complète, détails dans [SECURITY.md](../SECURITY.md)) :
  - seul l'écran qui a créé la partie peut la piloter ;
  - un joueur ne peut pas répondre ou voter à la place d'un autre ;
  - limites contre l'inondation de messages, la création de parties en masse et la recherche de
    PIN au hasard ;
  - CSP stricte, en-têtes de sécurité, contrôle de l'origine des connexions.
- **Admin** :
  - mot de passe chiffré (scrypt), sessions limitées dans le temps ;
  - nombre de tentatives de connexion limité, par nginx et par l'application ;
  - protection CSRF et journal de toutes les actions ;
  - les questions générées par l'IA attendent ta validation.
- **Contrôles automatiques** : la CI vérifie à chaque push l'absence de secrets dans le dépôt et
  de vulnérabilité connue (`npm audit`) ; Dependabot surveille les dépendances.

### Ce qui reste à ta charge

- Un **mot de passe admin long et unique**, et un **code premium généré** dans l'admin.
- Une **limite de dépenses** sur la clé Anthropic si tu actives l'IA ; laisse `AI_AUTO_APPROVE`
  désactivé.
- Activer l'**authentification à deux facteurs** sur GitHub, chez ton hébergeur, ton registrar
  et Backblaze : ce sont les vraies clés du royaume.
- Fusionner les PR Dependabot quand la CI est verte.
- Jeter un œil aux logs de temps en temps : `journalctl -u punchline | grep -E "rate limit|flood|login.failed"`.

### Limites connues

- Un PIN à 4 chiffres reste devinable par quelqu'un qui dispose de beaucoup d'adresses IP. Il
  permet d'entrer dans un salon (l'hôte peut exclure) ou de reprendre la place d'un joueur
  déconnecté depuis quelques secondes, rien de plus.
- Les limites par adresse IP sont généreuses, car tous les téléphones d'une soirée partagent
  souvent la même IP.

### Si tu penses avoir été piraté

1. **Couper** : `sudo systemctl stop punchline nginx` (ou éteindre le VPS depuis l'hébergeur).
2. **Révoquer tout ce que le serveur connaissait** :
   - supprimer la ligne `deploy` dans `/home/deploy/.ssh/authorized_keys` et le secret `VPS_SSH_KEY` sur GitHub ;
   - régénérer la clé B2 du VPS (l'ancienne ne pouvait de toute façon rien effacer) ;
   - régénérer la clé Anthropic ;
   - changer le mot de passe admin (ça ferme toutes les sessions) ;
   - générer un nouveau code premium.
3. **Ne pas réparer le serveur compromis** : en recréer un neuf (étapes 3 à 6, 30 minutes), puis
   restaurer la dernière sauvegarde **antérieure à l'intrusion** depuis B2 ou le NAS (étape 8).
4. Regarder dans l'historique admin (onglet **Historique**) et dans `journalctl` ce qui s'est
   passé, pour corriger la cause.

## 10. Dépannage

| Symptôme | Piste |
| --- | --- |
| `healthz` répond `503` / `mongo: disconnected` | `systemctl status mongod`, puis `journalctl -u mongod -n 50` |
| MongoDB s'arrête au démarrage : « Linux kernel versions 6.19 and newer has a known incompatibility » | MongoDB 8.0 refuse les noyaux 6.19 à 7.0.13. `uname -r` pour vérifier ; démarre sur le noyau standard d'Ubuntu 24.04 (6.8, `sudo apt install linux-generic`) ou un noyau ≥ 7.0.14. `setup-vps.sh` le détecte avant d'installer |
| Le site affiche 502 | le jeu ne tourne pas : `journalctl -u punchline -n 50` |
| « Admin panel disabled » dans les logs | `ADMIN_PASSWORD_HASH` manquant ou sans guillemets simples dans `punchline.env` |
| Le QR code ou l'adresse affichée sont faux | `PUBLIC_URL='https://punchline.mondomaine.fr'` dans `punchline.env`, puis redémarrer |
| Déploiement GitHub : `Host key verification failed` | `VPS_KNOWN_HOSTS` ne correspond pas à `VPS_HOST` (ou au port) |
| Déploiement GitHub : `Permission denied (publickey)` | `VPS_SSH_KEY` n'est pas la clé privée correspondant à `--deploy-key` |
| Le certificat HTTPS n'a pas été créé | DNS pas encore propagé : relance `setup-vps.sh` avec les mêmes options |
