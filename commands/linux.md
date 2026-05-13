# How to enjoy work on your laptop with 🐧

This guide will describe how to get Linux as primary OS onto your Queue-It laptop.

## Preparation

1. Create a bootable USB drive with Ubuntu (use vanilla Ubuntu with Gnome DE, latest LTS - 24.04 at the time of writing of this document).

1. Make sure your BIOS allows booting OSes signed by Canonical
   1. For this, I needed to press Enter while booting

   1. Then go for F1 to enter BIOS

   1. Under Security / Secure Boot, enable a toggle with a name something like `Enable 3rd party Microsoft UEFI CA`

## OS Installation

1. Boot the install drive, perform Ubuntu installation with these **_mandatory_** settings:
   1. Use LVM / encryption for full-disk encryption

   1. Tick install additional drivers, and update to latest versions

   1. Select a strong password

## A browser and connectivity

1. Ubuntu comes with Firefox pre-installed, but I prefer Chrome (one reason is the PWA support we'll be using for Teams and Outlook).

1. Install Chrome from https://www.google.com/chrome/.

1. I suggest that you make it Default, when it asks.

### Teams

1. Open https://teams.cloud.microsoft/ in Chrome, authenticate using your Queue-It credentials

1. When logged on, you'll see a download-ish icon on the URL bar, that allows to _"Install"_ the Teams PWA (you're actually just creating a launcher icon, that starts Chrome, but 🤷‍♂️).

1. Now Teams is available in the Apps View, feel free to pin it to your Dash.

### Outlook

Do the same as with Teams 👆, using https://outlook.office.com/.

### Dropbox

Install from https://www.dropbox.com/install-linux.

## Device management software for IT

### Intune

1.  Install **_Intune_**: [https://learn.microsoft.com/da-dk/intune/intune-service/user-help/microsoft-intune-app-linux](https://learn.microsoft.com/da-dk/intune/intune-service/user-help/microsoft-intune-app-linux 'https://learn.microsoft.com/da-dk/intune/intune-service/user-help/microsoft-intune-app-linux')

1.  Login to Intune with your company login

1.  It'll say that your device is not compliant at first, it takes some time to download the policies and configurations

### AdminByRequest

Obtain the installer image from IT, I got mine from ALSI via email (according to https://docs.adminbyrequest.com/endpoints/Linux/install.htm it needs to be fetched via an admin console, and is tenant-specific).

1.  Unpack (I got a `.7z`, my Gnome DE or Chrome knew how to unpack, if it didn't, I would've needed to install `p7zip-full`).

1.  `chmod +x abr-installer`

1.  `sudo ./abr-installer`

### HexNodeMdm

1.  `curl -L "https://queue-it.hexnodemdm.com/enroll/" --output ~/Downloads/hexNodeConfig`

1.  If you want to test the integrity of the installer SHA-256: `c0d26f90ae1e8ce7373dd93f529fba216da70a606472a46d880410dadd0660f5`

1.  `chmod +x hexNodeConfig`

1.  `sudo ./hexNodeConfig` (enjoy ABR 😜)

### Microsoft Defender

1.  Run the script IT gives you: `sudo python3 MicrosoftDefenderATPOnboardingLinuxServer.py`

1.  `sudo apt install mdatp mde-netfilter`

1.  `mdatp config real-time-protection --value enabled`

1.  Test#1: `mdatp health --field org_id` (Should provide a key)

1.  Test#2: `mdatp health --field real_time_protection_enabled` (Should return true)

1.  Test#3:

    > ONLY PERFORM IF Test#1 AND Test#2 IS SUCCESSFUL!

    `curl -o /tmp/eicar.com.txt https://secure.eicar.org/eicar.com.txt`

    👆 this is a test infected file that should be quarantined, and show up in `mdatp threat list`

## Quality of Life Stuff

### ThinkPad docking station

If you have a docking station with a DisplayLink sticker on the bottom, you'll need to install the Synaptic driver for it to make the external displays work.

1. Install the `.deb` that adds the package repo from https://www.synaptics.com/products/displaylink-graphics/downloads/ubuntu

1. `sudo apt update && sudo apt install displaylink-driver`

   > 👆 This compiles a `dkms` module, so if anything fails, install `dkms` and your `kernel-headers`.

1. This _should_ enroll a Secure boot key in order for the new kernel module to be allowed to load, so you will be instructed to reboot. On next boot, you'll see the MOK Enroll blue screen, enroll the key that's getting added.

### Fingerprint login

For me, everything worked out of the box, use the Gnome Users & Accounts widget to enroll your fingerprints, and enable fingerprint login.

## Dev Stuff

### VSCode

Follow https://code.visualstudio.com/docs/setup/linux

### Dotnet

One can install Dotnet from multiple sources, Microsoft has a lengthy [document](https://learn.microsoft.com/en-us/dotnet/core/install/linux-ubuntu-install?tabs=dotnet10&pivots=os-linux-ubuntu-2404) on how to chose. I went for using the install script, as I needed to have multiple versions of the SDK installed.

1. Get the script from https://learn.microsoft.com/en-us/dotnet/core/install/linux-scripted-manual#scripted-install

1. Use the script to install your preferred version: `./dotnet-install.sh --channel 9.0`

1. Set some paths on your `~/.profile`:

   ```
   # Dotnet
   export DOTNET_ROOT=$HOME/.dotnet
   export PATH=$PATH:$DOTNET_ROOT:$DOTNET_ROOT/tools
   export DOTNET_CLI_TELEMETRY_OPTOUT=1
   ```

1. To allow `dotnet` / `nuget` to fetch packages from DevOps: `curl -L https://aka.ms/install-artifacts-credprovider.sh | sh`.

### Azure (Devops) CLI

1. Follow https://learn.microsoft.com/en-us/cli/azure/install-azure-cli-linux?view=azure-cli-latest&pivots=apt to install `az`

   > 👆 Don't `az login`, that doesn't help.

1. Add Azure Devops plugin: https://learn.microsoft.com/en-us/azure/devops/cli/?view=azure-devops

1. `az devops login`
   > 👆 You'll need to create a Personal Access Token for this on https://dev.azure.com/queue-it/_usersSettings/tokens, chose the scopes wisely!

### Node

1. Install [nvm](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)

1. `nvm install node`

### Copilot CLI

1. `npm install -g @github/copilot`

### Azure DevOps MCP

1. Add the MCP to Copilot CLI following https://github.com/microsoft/azure-devops-mcp.

   > 👆 Selecting the relevant domains is highly recommended.

1. Pass your DevOps PAT via an environment variable: https://github.com/microsoft/azure-devops-mcp/blob/main/docs/TROUBLESHOOTING.md#token-authentication-via-environment-variables

### AWS VPN

1. Install the AWS VPN Client from https://docs.aws.amazon.com/vpn/latest/clientvpn-user/client-vpn-connect-linux.html#client-vpn-connect-linux-install.

   > 👆 You might be tempted to _not_ install a separate client, but use OVPN via NetworkManager, however that won't work, as our `.ovpn` configurations contain some non-standard settings enabling SSO auth.

1. Set up your necessary configurations following https://dev.azure.com/queue-it/Queue-it/_wiki/wikis/Queue-it.wiki/381/Connecting-To-VPN.

### AWS CLI

1. Install from `snap` (or using App Center).

1. Follow https://dev.azure.com/queue-it/Queue-it/_wiki/wikis/Queue-it.wiki/321/AWS-SSO (losely) to figure out the necessary config.

   > Mine is like:
   >
   > ```
   > cat ~/.aws/config
   > [profile test]
   > sso_session = Queue-It
   > sso_account_id = 700582653194
   > sso_role_name = PowerUserAccess-Dev
   > region = eu-west-1
   > [sso-session Queue-It]
   > sso_start_url = https://d-92670b4b2a.awsapps.com/start
   > sso_region = us-west-2
   > sso_registration_scopes = sso:account:access
   > ```

1. Configure shell autocomplete:
   1. `sudo ln -sf /snap/aws-cli/current/bin/aws_completer /usr/local/bin/aws_completer`

   1. `echo "complete -C '/usr/local/bin/aws_completer' aws" >> ~/.bashrc`

### Kubectl

1. Install from `snap` (or using App Center).
1. Get your `~/.kube/config` from https://cloud.linode.com/kubernetes/clusters.

### K9S

Install `.deb` from https://github.com/derailed/k9s/releases, both `snap` and `apt` are super outdated.

### Docker

Follow the [Installation Guide](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository).

After that, in order to get the containers have network access, I also needed to:

```
echo "net.ipv4.ip_forward=1" | sudo tee /etc/sysctl.d/99-docker.conf
sudo sysctl -p /etc/sysctl.d/99-docker.conf
```
