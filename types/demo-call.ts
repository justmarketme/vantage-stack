export type TabType = 'has-website' | 'manual-info'

export interface WebsiteFormData {
  url: string
}

export interface ManualFormData {
  businessName: string
  location: string
  pricing: string
  services: string
}

export interface PreviewData {
  mode: 'url' | 'manual'
  url?: string
  businessName?: string
  location?: string
  pricing?: string
  services?: string[]
  screenshotUrl?: string
  corpusId?: string
  scrapedTitle?: string
}

export interface DeployResult {
  success: boolean
  mode: 'url' | 'manual'
  screenshotUrl?: string
  corpusId?: string
  scrapedTitle?: string
  message?: string
}

export interface TwilioCallResult {
  success: boolean
  callSid?: string
  message?: string
}
