import { getInput, info, setOutput } from '@actions/core'
import { getOctokit } from '@actions/github'
import { LIB_VERSION } from '@src/version'
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// read in token
let token: string
try {
  token = getInput('github_token', { required: true })
} catch (e1) {
  try {
    token = readFileSync(join(homedir(), '.github_token'), 'utf8').trim()
  } catch (e2) {
    if (e2 instanceof Error && e2.name == 'ENOENT') {
      // ENOENT: file non-existent
      throw e1
    } else {
      throw e2
    }
  }
}

// initialize ocotokit
const octokit = getOctokit(token)

interface Options {
  org: string | null
  user: string | null
  repo: string | null
}
interface Issues {
  [databaseId: number]: {
    id: number
    title: string
  }
}

async function projectIssues(
  project: number,
  options: Options,
): Promise<Issues> {
  // common part of query
  interface Content {
    content: {
      databaseId: number
      number: number
      title: string
    }
  }
  interface Cards {
    cards: { nodes: Array<Content> }
  }
  interface Project {
    project: { columns: { nodes: Array<Cards> } }
  }
  const query: string = `
    project(number: ${project}) {
      columns(first: 10) {
        nodes {
          cards {
            nodes {
              content {
                ... on Issue {
                  databaseId
                  number
                  title
                }
              }
            }
          }
        }
      }
    }
  `

  let resp: Project
  if (options.org) {
    interface Org {
      organization: Project
    }
    const q = `{ organization(login: "${options.org}") { ${query} } }`
    const raw: Org = await octokit.graphql(q)
    resp = raw.organization
  } else if (options.user) {
    interface User {
      user: Project
    }
    const q = `{ user(login: "${options.user}") { ${query} } }`
    const raw: User = await octokit.graphql(q)
    resp = raw.user
  } else if (options.repo) {
    interface Repo {
      repository: Project
    }
    const [owner, name] = options.repo.split('/')
    const q = `{ repository(owner: "${owner}", name: "${name}") { ${query} } }`
    const raw: Repo = await octokit.graphql(q)
    resp = raw.repository
  } else {
    throw new Error('Input required and not supplied: org, user, or repo')
  }

  // flatten response into list of issue ids
  if (!resp.project) return {}

  return resp.project.columns.nodes.reduce(
    (prev: Issues, cur: Cards): Issues => {
      return {
        ...prev,
        ...cur.cards.nodes.reduce((prev: Issues, cur: Content): Issues => {
          if (cur.content) {
            prev[cur.content.databaseId] = {
              id: cur.content.number,
              title: cur.content.title,
            }
          }
          return prev
        }, {}),
      }
    },
    {},
  )
}

async function projectHasIssue(
  project: number,
  issue: number | null,
  options: Options,
): Promise<Boolean | Issues> {
  const issues: Issues = await projectIssues(project, options)
  if (issue) {
    // since obj keys are string we need to do string comparison
    const sissue = issue.toString()
    return Object.keys(issues).some(i => i === sissue)
  } else {
    return issues
  }
}

async function main_cli(): Promise<void> {
  const program = new Command()

  program.version(LIB_VERSION).showSuggestionAfterError()

  program
    .argument('<project>', 'the project number to search', parseInt)
    .argument('[issue]', 'the issue number to search for', parseInt)
    .option('-o, --org <org>', 'the organization to search (e.g. conda)')
    .option('-u, --user <user>', 'the user to search (e.g. conda-bot)')
    .option('-r, --repo <repo>', 'the repository to search (e.g. conda/conda)')
    .description('check if issue is defined in project')
    .action(
      async (
        project: number,
        issue: number | null,
        options: Options,
      ): Promise<void> => {
        const result = await projectHasIssue(project, issue, options)
        console.log(result)
      },
    )

  program.parseAsync()
}

async function main_env(): Promise<void> {
  const org = getInput('org') || null
  const user = getInput('user') || null
  const repo = getInput('repo') || null
  const project = parseInt(getInput('project', { required: true }))
  const rissue = getInput('issue')
  const issue = rissue ? parseInt(rissue) : null

  const result = await projectHasIssue(project, issue, {
    org: org,
    user: user,
    repo: repo,
  })
  if (!!result === result) {
    if (result)
      info(`✅ issue (id: ${issue}) exists in project (number: ${project})`)
    else
      info(
        `❌ issue (id: ${issue}) does not exist in project (number: ${project})`,
      )
    setOutput('contains', result)
  } else {
    setOutput('issues', result)
  }
}

// run as CLI tool or GitHub Action
if (process.argv.length > 2) main_cli()
else main_env()
