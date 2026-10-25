/** LinkedIn post search, newest first, from the last 24 hours. */
export function linkedinSearchUrl(q: string) {
  return `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(`"${q}"`)}&datePosted=%22past-24h%22&sortBy=%22date_posted%22`;
}
