#!/usr/bin/env node

// This downloads the latest release of Redwood from https://github.com/redwoodjs/create-redwood-app/
// and extracts it into the supplied directory.
//
// Usage:
// `$ yarn create redwood-app ./path/to/new-project`

import fs from 'fs'
import path from 'path'

import decompress from 'decompress'
import axios from 'axios'
import Listr from 'listr'
// import parse from 'yargs-parser'
import execa from 'execa'
import tmp from 'tmp'

// ---
// QUESTION: PP, why did you originally include this step below?
// ---
// export const parseArgs = () => {
//   const parsed = parse(process.argv.slice(2))
//   const { _: positional, ...flags } = parsed

//   return [positional, flags]
// }
//
// const targetDir = parseArgs()?.[0]?.[0]

const RELEASE_URL =
  'https://api.github.com/repos/redwoodjs/create-redwood-app/releases'

const latestReleaseZipFile = async () => {
  const response = await axios.get(RELEASE_URL)
  return response.data[0].zipball_url
}

const downloadFile = async (sourceUrl, targetFile) => {
  const writer = fs.createWriteStream(targetFile)
  const response = await axios.get(sourceUrl, {
    responseType: 'stream',
  })
  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}

const tmpDownloadPath = tmp.tmpNameSync({
  prefix: 'redwood',
  postfix: '.zip',
})

const targetDir = String(process.argv.slice(2))
const newAppDir = path.resolve(process.cwd(), targetDir)

const newTitle = targetDir
  .split('/')
  .slice(-1)[0]
  .split(/[ _-]/)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ')

const newTitleTag = '<title>' + String(newTitle) + '</title>'

export const CreateNewApp = () => {
  //TODO does this need async() ?
  const tasks = new Listr([
    {
      title: 'Checking if Soil is Available',
      task: () => {
        return new Listr([
          {
            //TODO ugly fail; but good enough?
            title: 'Checking for path in command',
            task: (ctx) => {
              if (!targetDir) {
                ctx.stop = true
                throw new Error(
                  'Missing path arg. Usage `yarn create redwood-app ./path/to/new-project`'
                )
              }
            },
          },
          {
            //TODO ugly fail; but good enough?
            title: 'Checking if directory already exists',
            task: (ctx) => {
              if (fs.existsSync(newAppDir)) {
                ctx.stop = true
                throw new Error(
                  `Install error: directory ${targetDir} already exists.`
                )
              }
            },
          },
        ])
      },
    },
    {
      title: `Tilling Soil at "${newAppDir}/"`,
      enabled: (ctx) => ctx.stop != true,
      task: (ctx, task) =>
        fs.mkdirSync(newAppDir, { recursive: true }, (e) => {
          ctx.stop = true
          task.skip(`Error creating directory ${targetDir}`)
        }),
    },
    {
      //TODO better Listr error handling and ctx updates
      title: 'Planting Seed',
      enabled: (ctx) => ctx.stop != true,
      task: () => {
        return new Listr([
          {
            title: `Downloading latest release from ${RELEASE_URL}`,
            task: async () => {
              // const releaseUrl = await latestReleaseZipFile()
              downloadFile(latestReleaseZipFile(), tmpDownloadPath)
            },
          },
          {
            title: 'Extracting...',
            task: async () => {
              decompress(tmpDownloadPath, newAppDir, { strip: 1 })
            },
          },
          {
            title: 'Renaming index.html Meta Title',
            task: async (task) => {
              const fileData = fs.readFileSync(
                newAppDir + '/web/src/index.html',
                'utf8',
                (e, data) => {
                  //skipping, error should not kill remaining installation
                  if (e) {
                    task.skip('Could not read /web/src/index.html')
                  }
                  return data
                }
              )
              fs.writeFileSync(
                newAppDir + '/web/src/index.html',
                fileData.replace(newTitle, newTitleTag),
                'utf8',
                (e) => {
                  if (e) {
                    task.skip('Could not write /web/src/index.html')
                  }
                }
              )
            },
          },
        ])
      },
    },
    {
      title: 'Watering Soil',
      enabled: (ctx) => ctx.stop != true,
      task: async (ctx, task) => {
        task.output = `${task.title} ...installing packages...`
        return execa('yarn install', {
          shell: true,
          cwd: `${targetDir}`,
        }).catch(() => {
          ctx.stop = true
          task.title = `${task.title} (or not)`
          task.skip('Yarn not installed. Cannot proceed.')
        })
      },
    },
    {
      title: 'Success: Your Redwood is Ready to Grow!',
      task: () => {
        console.log('installation complete')
      },
    },
  ])
  tasks.run()
}

CreateNewApp()
