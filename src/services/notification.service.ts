import axios from 'axios';

export interface NotificationPayload {
  registrationId: string;
  txHash: string;
  asset: string;
  memo: string;
  referenceId: string;
  userAddress?: string;
  network: string;
  hotWalletAddress: string;
  hotWalletRuneBalance?: string;
  registrationsRemaining?: number;
  timestamp: string;
}

export interface FailureNotificationPayload {
  txHash: string;
  asset: string;
  memo: string;
  error: string;
  errorDetails?: string;
  network: string;
  hotWalletAddress: string;
  hotWalletRuneBalance?: string;
  registrationsRemaining?: number;
  timestamp: string;
  userAddress?: string;
}

export interface LowBalanceAlertPayload {
  network: string;
  hotWalletAddress: string;
  runeBalance: string;
  registrationsRemaining: number;
  memolessTxCost: number;
  networkTxFee: number;
  totalRegistrationCost: number;
  threshold: number;
  timestamp: string;
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordField[];
  timestamp?: string;
  footer?: {
    text: string;
  };
}

export interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface SlackMessage {
  text?: string;
  blocks?: SlackBlock[];
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
}

export class NotificationService {
  private discordWebhookUrl?: string;
  private slackWebhookUrl?: string;
  private discordEnabled: boolean = false;
  private slackEnabled: boolean = false;
  private lowBalanceThreshold: number;

  constructor() {
    this.discordWebhookUrl = process.env.DISCORD_WEBHOOK;
    this.slackWebhookUrl = process.env.SLACK_WEBHOOK;
    this.discordEnabled = process.env.ENABLE_DISCORD_WEBHOOK === 'true';
    this.slackEnabled = process.env.ENABLE_SLACK_WEBHOOK === 'true';
    this.lowBalanceThreshold = parseInt(process.env.LOW_BALANCE_ALERT_THRESHOLD || '25');

    this.logConfiguration();
  }

  private logConfiguration(): void {
    console.log('🔔 [NotificationService] Initializing notification service...');
    
    if (this.discordEnabled && this.discordWebhookUrl) {
      console.log('🟣 [NotificationService] Discord notifications ENABLED');
    } else if (this.discordEnabled && !this.discordWebhookUrl) {
      console.log('⚠️  [NotificationService] Discord notifications enabled but no webhook URL provided');
    } else {
      console.log('🔴 [NotificationService] Discord notifications DISABLED');
    }

    if (this.slackEnabled && this.slackWebhookUrl) {
      console.log('🟢 [NotificationService] Slack notifications ENABLED');
    } else if (this.slackEnabled && !this.slackWebhookUrl) {
      console.log('⚠️  [NotificationService] Slack notifications enabled but no webhook URL provided');
    } else {
      console.log('🔴 [NotificationService] Slack notifications DISABLED');
    }
  }

  async sendRegistrationNotification(payload: NotificationPayload): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.discordEnabled && this.discordWebhookUrl) {
      promises.push(this.sendDiscordNotification(payload));
    }

    if (this.slackEnabled && this.slackWebhookUrl) {
      promises.push(this.sendSlackNotification(payload));
    }

    if (promises.length > 0) {
      console.log('📤 [NotificationService] Sending registration notifications...');
      await Promise.allSettled(promises);
    }
  }

  async sendFailureNotification(payload: FailureNotificationPayload): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.discordEnabled && this.discordWebhookUrl) {
      promises.push(this.sendDiscordFailureNotification(payload));
    }

    if (this.slackEnabled && this.slackWebhookUrl) {
      promises.push(this.sendSlackFailureNotification(payload));
    }

    if (promises.length > 0) {
      console.log('📤 [NotificationService] Sending failure notifications...');
      await Promise.allSettled(promises);
    }
  }

  async sendLowBalanceAlert(payload: LowBalanceAlertPayload): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.discordEnabled && this.discordWebhookUrl) {
      promises.push(this.sendDiscordLowBalanceAlert(payload));
    }

    if (this.slackEnabled && this.slackWebhookUrl) {
      promises.push(this.sendSlackLowBalanceAlert(payload));
    }

    if (promises.length > 0) {
      console.log('🚨 [NotificationService] Sending low balance alerts...');
      await Promise.allSettled(promises);
    }
  }

  shouldSendLowBalanceAlert(registrationsRemaining: number): boolean {
    return registrationsRemaining > 0 && registrationsRemaining <= this.lowBalanceThreshold;
  }

  private async sendDiscordLowBalanceAlert(payload: LowBalanceAlertPayload): Promise<void> {
    try {
      const embed: DiscordEmbed = {
        title: '🚨 LOW BALANCE ALERT',
        description: `Hot wallet balance is running low on ${payload.network}! Only ${payload.registrationsRemaining} registrations remaining.`,
        color: 0xFF6B35, // Orange color for warnings
        fields: [
          {
            name: '💳 Hot Wallet Address',
            value: payload.hotWalletAddress,
            inline: false
          },
          {
            name: '💰 RUNE Balance',
            value: `${payload.runeBalance} RUNE`,
            inline: true
          },
          {
            name: '🔢 Registrations Remaining',
            value: payload.registrationsRemaining.toString(),
            inline: true
          },
          {
            name: '⚠️ Alert Threshold',
            value: payload.threshold.toString(),
            inline: true
          },
          {
            name: '🏷️ Memoless TX Cost',
            value: `${payload.memolessTxCost} RUNE`,
            inline: true
          },
          {
            name: '⛽ Network TX Fee',
            value: `${payload.networkTxFee} RUNE`,
            inline: true
          },
          {
            name: '📊 Total Cost Per Registration',
            value: `${payload.totalRegistrationCost} RUNE`,
            inline: true
          },
          {
            name: '🌐 Network',
            value: payload.network.toUpperCase(),
            inline: true
          }
        ],
        timestamp: payload.timestamp,
        footer: {
          text: `Please fund the hot wallet to continue registrations`
        }
      };

      const message: DiscordMessage = {
        content: '@here',
        embeds: [embed]
      };

      await axios.post(this.discordWebhookUrl!, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      console.log('✅ [NotificationService] Discord low balance alert sent successfully');
    } catch (error) {
      console.error('❌ [NotificationService] Failed to send Discord low balance alert:', (error as Error).message);
    }
  }

  private async sendDiscordNotification(payload: NotificationPayload): Promise<void> {
    try {
      const embed: DiscordEmbed = {
        title: '🔄 New Memoless Registration',
        description: `A new memoless transaction has been registered on ${payload.network}`,
        color: payload.network === 'mainnet' ? 0x00ff00 : 0xffa500, // Green for mainnet, Orange for stagenet
        fields: [
          {
            name: '🪙 Asset',
            value: payload.asset,
            inline: true
          },
          {
            name: '📝 Reference ID',
            value: payload.referenceId,
            inline: true
          },
          {
            name: '🌐 Network',
            value: payload.network.toUpperCase(),
            inline: true
          },
          {
            name: '💳 Hot Wallet',
            value: payload.hotWalletAddress,
            inline: false
          },
          {
            name: '🔗 Transaction Hash',
            value: payload.txHash,
            inline: false
          },
          {
            name: '📄 Memo',
            value: `\`${payload.memo}\``,
            inline: false
          }
        ],
        timestamp: payload.timestamp,
        footer: {
          text: `Registration ID: ${payload.registrationId}`
        }
      };

      // Add RUNE balance if available
      if (payload.hotWalletRuneBalance) {
        embed.fields!.splice(3, 0, {
          name: '💰 Hot Wallet RUNE Balance',
          value: `${payload.hotWalletRuneBalance} RUNE`,
          inline: true
        });
      }

      // Add registrations remaining if available
      if (payload.registrationsRemaining !== undefined) {
        embed.fields!.splice(payload.hotWalletRuneBalance ? 4 : 3, 0, {
          name: '🔢 Registrations Remaining',
          value: payload.registrationsRemaining.toString(),
          inline: true
        });
      }

      // Add user address if available
      if (payload.userAddress) {
        embed.fields!.splice(-2, 0, {
          name: '👤 User Address',
          value: payload.userAddress,
          inline: false
        });
      }

      const message: DiscordMessage = {
        embeds: [embed]
      };

      await axios.post(this.discordWebhookUrl!, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      console.log('✅ [NotificationService] Discord notification sent successfully');
    } catch (error) {
      console.error('❌ [NotificationService] Failed to send Discord notification:', (error as Error).message);
    }
  }

  private async sendSlackLowBalanceAlert(payload: LowBalanceAlertPayload): Promise<void> {
    try {
      const blocks: SlackBlock[] = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 LOW BALANCE ALERT'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Hot wallet balance is running low on ${payload.network.toUpperCase()}!*\nOnly *${payload.registrationsRemaining}* registrations remaining.`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*💳 Hot Wallet Address:*\n${payload.hotWalletAddress}`
            }
          ]
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*💰 RUNE Balance:*\n${payload.runeBalance} RUNE`
            },
            {
              type: 'mrkdwn',
              text: `*🔢 Registrations Remaining:*\n${payload.registrationsRemaining}`
            },
            {
              type: 'mrkdwn',
              text: `*⚠️ Alert Threshold:*\n${payload.threshold}`
            }
          ]
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*🏷️ Memoless TX Cost:*\n${payload.memolessTxCost} RUNE`
            },
            {
              type: 'mrkdwn',
              text: `*⛽ Network TX Fee:*\n${payload.networkTxFee} RUNE`
            },
            {
              type: 'mrkdwn',
              text: `*📊 Total Cost Per Registration:*\n${payload.totalRegistrationCost} RUNE`
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `⚠️ Please fund the hot wallet to continue registrations | ${payload.timestamp}`
            }
          ]
        } as any
      ];

      const message: SlackMessage = {
        text: '@here - Low Balance Alert!',
        blocks: blocks
      };

      await axios.post(this.slackWebhookUrl!, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      console.log('✅ [NotificationService] Slack low balance alert sent successfully');
    } catch (error) {
      console.error('❌ [NotificationService] Failed to send Slack low balance alert:', (error as Error).message);
    }
  }

  private async sendSlackNotification(payload: NotificationPayload): Promise<void> {
    try {
      const blocks: SlackBlock[] = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🔄 New Memoless Registration'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*🪙 Asset:*\n${payload.asset}`
            },
            {
              type: 'mrkdwn',
              text: `*📝 Reference ID:*\n${payload.referenceId}`
            },
            {
              type: 'mrkdwn',
              text: `*🌐 Network:*\n${payload.network.toUpperCase()}`
            }
          ]
        }
      ];

      // Add RUNE balance if available
      if (payload.hotWalletRuneBalance) {
        blocks[1].fields!.push({
          type: 'mrkdwn',
          text: `*💰 RUNE Balance:*\n${payload.hotWalletRuneBalance} RUNE`
        });
      }

      // Add registrations remaining if available
      if (payload.registrationsRemaining !== undefined) {
        blocks[1].fields!.push({
          type: 'mrkdwn',
          text: `*🔢 Registrations Remaining:*\n${payload.registrationsRemaining}`
        });
      }

      // Add additional details
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*💳 Hot Wallet:*\n${payload.hotWalletAddress}`
          },
          {
            type: 'mrkdwn',
            text: `*🔗 TX Hash:*\n${payload.txHash}`
          }
        ]
      });

      // Add user address if available
      if (payload.userAddress) {
        blocks[2].fields!.push({
          type: 'mrkdwn',
          text: `*👤 User Address:*\n${payload.userAddress}`
        });
      }

      // Add memo
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📄 Memo:*\n\`${payload.memo}\``
        }
      });

      // Add footer
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Registration ID: ${payload.registrationId} | ${payload.timestamp}`
          }
        ]
      } as any);

      const message: SlackMessage = {
        blocks: blocks
      };

      await axios.post(this.slackWebhookUrl!, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      console.log('✅ [NotificationService] Slack notification sent successfully');
    } catch (error) {
      console.error('❌ [NotificationService] Failed to send Slack notification:', (error as Error).message);
    }
  }

  isDiscordEnabled(): boolean {
    return this.discordEnabled && !!this.discordWebhookUrl;
  }

  isSlackEnabled(): boolean {
    return this.slackEnabled && !!this.slackWebhookUrl;
  }

  isAnyNotificationEnabled(): boolean {
    return this.isDiscordEnabled() || this.isSlackEnabled();
  }

  private async sendDiscordFailureNotification(payload: FailureNotificationPayload): Promise<void> {
    try {
      const embed: DiscordEmbed = {
        title: '❌ Registration Failed',
        description: `A memoless registration attempt failed on ${payload.network}`,
        color: 0xff0000, // Red color for failures
        fields: [
          {
            name: '🪙 Asset',
            value: payload.asset,
            inline: true
          },
          {
            name: '🌐 Network',
            value: payload.network.toUpperCase(),
            inline: true
          },
          {
            name: '💳 Hot Wallet',
            value: payload.hotWalletAddress,
            inline: false
          },
          {
            name: '🔗 Transaction Hash',
            value: payload.txHash,
            inline: false
          },
          {
            name: '📄 Intended Memo',
            value: `\`${payload.memo}\``,
            inline: false
          },
          {
            name: '❌ Error',
            value: payload.error,
            inline: false
          }
        ],
        timestamp: payload.timestamp,
        footer: {
          text: `Registration Failed - ${payload.network}`
        }
      };

      // Add RUNE balance if available
      if (payload.hotWalletRuneBalance) {
        embed.fields!.splice(2, 0, {
          name: '💰 Hot Wallet RUNE Balance',
          value: `${payload.hotWalletRuneBalance} RUNE`,
          inline: true
        });
      }

      // Add registrations remaining if available
      if (payload.registrationsRemaining !== undefined) {
        embed.fields!.splice(payload.hotWalletRuneBalance ? 3 : 2, 0, {
          name: '🔢 Registrations Remaining',
          value: payload.registrationsRemaining.toString(),
          inline: true
        });
      }

      // Add user address if available
      if (payload.userAddress) {
        embed.fields!.splice(-2, 0, {
          name: '👤 User Address',
          value: payload.userAddress,
          inline: false
        });
      }

      // Add error details if available
      if (payload.errorDetails) {
        embed.fields!.push({
          name: '🔍 Error Details',
          value: payload.errorDetails.substring(0, 1000), // Discord field limit
          inline: false
        });
      }

      const message: DiscordMessage = {
        embeds: [embed]
      };

      await axios.post(this.discordWebhookUrl!, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      console.log('✅ [NotificationService] Discord failure notification sent successfully');
    } catch (error) {
      console.error('❌ [NotificationService] Failed to send Discord failure notification:', (error as Error).message);
    }
  }

  private async sendSlackFailureNotification(payload: FailureNotificationPayload): Promise<void> {
    try {
      const blocks: SlackBlock[] = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '❌ Registration Failed'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*🪙 Asset:*\n${payload.asset}`
            },
            {
              type: 'mrkdwn',
              text: `*🌐 Network:*\n${payload.network.toUpperCase()}`
            }
          ]
        }
      ];

      // Add RUNE balance if available
      if (payload.hotWalletRuneBalance) {
        blocks[1].fields!.push({
          type: 'mrkdwn',
          text: `*💰 RUNE Balance:*\n${payload.hotWalletRuneBalance} RUNE`
        });
      }

      // Add registrations remaining if available
      if (payload.registrationsRemaining !== undefined) {
        blocks[1].fields!.push({
          type: 'mrkdwn',
          text: `*🔢 Registrations Remaining:*\n${payload.registrationsRemaining}`
        });
      }

      // Add additional details
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*💳 Hot Wallet:*\n${payload.hotWalletAddress}`
          },
          {
            type: 'mrkdwn',
            text: `*🔗 TX Hash:*\n${payload.txHash}`
          }
        ]
      });

      // Add user address if available
      if (payload.userAddress) {
        blocks[2].fields!.push({
          type: 'mrkdwn',
          text: `*👤 User Address:*\n${payload.userAddress}`
        });
      }

      // Add memo
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📄 Intended Memo:*\n\`${payload.memo}\``
        }
      });

      // Add error
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*❌ Error:*\n${payload.error}`
        }
      });

      // Add error details if available
      if (payload.errorDetails) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🔍 Error Details:*\n\`\`\`${payload.errorDetails.substring(0, 2000)}\`\`\``
          }
        });
      }

      // Add footer
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Registration Failed | ${payload.timestamp}`
          }
        ]
      } as any);

      const message: SlackMessage = {
        blocks: blocks
      };

      await axios.post(this.slackWebhookUrl!, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      console.log('✅ [NotificationService] Slack failure notification sent successfully');
    } catch (error) {
      console.error('❌ [NotificationService] Failed to send Slack failure notification:', (error as Error).message);
    }
  }
}