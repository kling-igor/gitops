import nodegit from 'nodegit'
import { resolve, join } from 'path'
import { ensureDir, writeFile } from 'fs-extra'

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

;(async () => {
  try {
    const repo = await createRepository(resolve('/tmp/gitops'))
    const workdir = repo.workdir()

    await ensureDir(join(workdir, 'src'))
    writeFile(join(workdir, 'src', 'index.js'), 'console.log("hello world")\n')

    const index = await refreshIndex(repo)

    await addToIndex(index, join('src', 'index.js'))

    const oid = await writeIndex(index)

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

    const commitId = await repo.createCommit('HEAD', author, committer, 'message', oid, []) // first commit has no parents
    console.log('commitId:', commitId.toString())

    const head = await nodegit.Reference.nameToId(repo, 'HEAD')
    console.log('HEAD:', head.toString())
  } catch (e) {
    console.error(e)
  }
})()