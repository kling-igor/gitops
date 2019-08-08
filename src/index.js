require('dotenv').config()
import nodegit from 'nodegit'
import { resolve, join } from 'path'
import { ensureDir, writeFile } from 'fs-extra'

const { GITHUB_PASSWORD } = process.env

/**
 * Opens git repository by specified path
 * @param {String} path
 * @returns {Repository}
 */
async function openRepository(path) {
  return nodegit.Repository.open(path)
}

/**
 * Creates git repository in specified path
 * @param {String} path
 * @returns {Repository}
 */
async function createRepository(path) {
  return nodegit.Repository.init(path, 0)
}

/**
 * Refreshes index
 * @param {Repository} repository
 * @returns {Index}
 */
async function refreshIndex(repository) {
  return repository.refreshIndex()
}

/**
 * Adds path to index
 * @param {Index} index
 * @param {String} path
 */
async function addToIndex(index, path) {
  return index.addByPath(path)
}

/**
 * Writes to index
 * @param {Index} index
 * @returns {OID}
 */
async function writeIndex(index) {
  return index.write().then(() => index.writeTree())
}

function fileStatus(file) {
  let result = ''
  if (file.isNew()) {
    result += 'A'
  }
  if (file.isModified()) {
    result += 'M'
  }
  // if (file.isTypechange()) { result += ''};
  if (file.isRenamed()) {
    result += 'R'
  }
  if (file.isIgnored()) {
    result += '?'
  }
  if (file.isDeleted()) {
    result += 'D'
  }
  if (file.isConflicted()) {
    result += 'C'
  }
  if (file.inIndex()) {
    result += 'I'
  }
  return result
}

/**
 * Gets file statuses
 * @param {Repository} repo
 * @returns {{path:String, status:String}[]}
 */
async function status(repo) {
  const statuses = await repo.getStatus()
  return statuses.map(file => ({ path: file.path(), status: fileStatus(file) }))
}

/**
 * Creates tag on commit
 * @param {Repository} repo
 * @param {{String | Oid}} commit
 * @param {String} tagName
 * @param {String} tagMessage
 */
async function createTag(repo, commit, tagName, tagMessage) {
  let oid
  if (typeof commit === 'string') {
    oid = nodegit.Oid.fromString(commit)
  }
  const tag = await repo.createTag(oid || commit, tagName, tagMessage)
  console.log('TAG:', tag)
}

/**
 * Creates branch
 * @param {Repository} repo
 * @param {String} name
 * @param {String | Oid} commit
 * @returns {Reference}
 */
async function createBranch(repo, name, commit) {
  let oid
  if (typeof commit === 'string') {
    oid = nodegit.Oid.fromString(commit)
  }

  return await repo.createBranch(name, oid || commit, 0 /* do not overwrite if exists */)
}

/**
 * Deletes tag
 * @param {Repository} repo
 * @param {String} tagName
 */
async function deleteTagByName(repo, tagName) {
  await repo.deleteTagByName(tagName)
}

/**
 * Checkouts on specified branch (rejecting working directory changes)
 * @param {Repository} repo
 * @param {String} [branch='master']
 */
async function checkout(repo, branch = 'master') {
  await repo.checkoutBranch(branch, {
    checkoutStrategy: nodegit.Checkout.STRATEGY.FORCE
  })
}

/**
 * Clones remote repository
 * @param {String} url- repo remote url
 * @param {String} path - path to clone repo to
 * @param {String} [username] - optional username
 * @param {String} [password] - optional password
 */
const cloneRepo = async (url, path, username, password) => {
  return await nodegit.Clone(url, path, {
    fetchOpts: {
      callbacks: {
        // github will fail cert check on some OSX machines, this overrides that check
        certificateCheck: () => 0,
        credentials: username && password ? () => nodegit.Cred.userpassPlaintextNew(username, password) : null,
        transferProgress: progress => console.log('clone progress:', progress)
      }
    }
  })
}

const createRepoAndCommit = async () => {
  const repo = await createRepository(resolve('/tmp/gitops'))
  const workdir = repo.workdir()

  await ensureDir(join(workdir, 'src'))
  writeFile(join(workdir, 'src', 'index.js'), 'console.log("hello world")\n')

  const index = await refreshIndex(repo)

  await addToIndex(index, join('src', 'index.js'))

  const treeOid = await writeIndex(index)

  const statuses = await status(repo)
  for (const { path, status } of statuses) {
    console.log(`${status} ${path}`)
  }

  // there is no HEAD in new repo
  // const head = await nodegit.Reference.nameToId(repo, 'HEAD')
  // console.log(head.toString())
  // const parentCommit = await repo.getCommit(head)
  const author = nodegit.Signature.now('Igor Kling', 'klingigor@gmail.com')
  const committer = author

  const commit = await repo.createCommit(
    'HEAD' /* or null to do not update the HEAD */,
    author,
    committer,
    'commit message',
    treeOid,
    []
  ) // first commit has no parents
  console.log('commitId:', commit.toString())

  const head = await nodegit.Reference.nameToId(repo, 'HEAD')
  console.log('HEAD:', head.toString())

  // await createTag(repo, commit.toString(), 'MYTAG', 'Tag message...')

  // await deleteTagByName(repo, 'MYTAG')
}

const cloneRepositoryAndCreateBranch = async () => {
  const path = resolve('/tmp', 'lua-stack')
  const repo = await cloneRepo('https://github.com/kling-igor/lua-stack', path, 'klingigor@gmail.com', GITHUB_PASSWORD)

  await checkout(repo)

  const branchRef = await repo.getCurrentBranch()
  const branchName = branchRef.shorthand()
  console.log(`On ${branchName} ${branchRef.target()}`)

  const commit = await repo.getBranchCommit(branchName)
  const newBranchRef = await createBranch(repo, 'mybranch', commit)
  console.log(`On ${newBranchRef.shorthand()} ${newBranchRef.target()}`)
}

;(async () => {
  try {
    await cloneRepositoryAndCreateBranch()
  } catch (e) {
    console.error(e)
  }
})()
