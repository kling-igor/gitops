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

// repository.workdir()
// repository.refreshIndex();

/**
 * Creates git repository in specified path
 * @param {String} path
 * @returns {Repository}
 */
async function createRepository(path) {
  return nodegit.Repository.init(path, 0)
}

/**
 *
 * @param {Repository} repository
 * @returns {Index}
 */
async function refreshIndex(repository) {
  return repository.refreshIndex()
}

/**
 *
 * @param {Index} index
 * @param {String} path
 */
async function addToIndex(index, path) {
  return index.addByPath(path)
}

/**
 *
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

async function status(repo) {
  const statuses = await repo.getStatus()
  return statuses.map(file => ({ path: file.path(), status: fileStatus(file) }))
}

async function createTag(repo, commitId, tagName, tagMessage) {
  const oid = nodegit.Oid.fromString(commitId)
  const tag = await repo.createTag(oid, tagName, tagMessage)
  console.log('TAG:', tag)
}

async function deleteTagByName(repo, tagName) {
  await repo.deleteTagByName(tagName)
}

async function checkout(repo, branch = 'master') {
  await repo.checkoutBranch(branch, {
    checkoutStrategy: nodegit.Checkout.STRATEGY.FORCE
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
  const author = nodegit.Signature.now('Igor Kling', 'klingiv@altarix.ru')
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

/**
 *
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

;(async () => {
  try {
    const path = resolve('/tmp', 'lua-stack')
    const repo = await cloneRepo(
      'https://github.com/kling-igor/lua-stack',
      path,
      'klingigor@gmail.com',
      GITHUB_PASSWORD
    )

    await checkout(repo)

    const branch = await repo.getCurrentBranch()
    console.log(`On ${branch.shorthand()} ${branch.target()}`)
  } catch (e) {
    console.error(e)
  }
})()
