import type { CommandOptions } from '@adonisjs/core/types/ace'
import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import string from '@adonisjs/core/helpers/string'
import { stubsRoot } from '../stubs/main.ts'
import fs from 'node:fs'

export default class MakeCommand extends BaseCommand {
  static commandName = 'admin:resource'
  static description = 'make a resource controller for model'
  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'resource name' })
  declare name: string

  @flags.boolean({ description: 'overwrite existing', default: false })
  declare force: boolean

  async run() {
    const codemods = await this.createCodemods()
    codemods.overwriteExisting = this.force

    const className = string.pascalCase(this.name)
    const fileName = string.snakeCase(this.name)
    await codemods.makeUsingStub(stubsRoot, '/make/resource_controller.stub', {
      className,
      fileName,
    })

    // append resource controller to routes.ts
    const filePath = this.app.startPath('admin.ts')
    const byline = 'registerSystemControllers('
    const content = `    router.resource('${fileName}', '#controllers/admin/${fileName}_controller').apiOnly().as('${fileName}')`
    const added = this.appendFileByString(filePath, content, byline)
    if (!added) {
      this.logger.action('change start/admin.ts').succeeded()
    } else {
      this.logger.action('change start/admin.ts').skipped()
    }
  }

  protected appendFileByString(filePath: string, content: string, by: string) {
    if (fs.existsSync(filePath)) {
      let file = fs.readFileSync(filePath, 'utf-8')
      let lines = file.split('\n')
      for (let i in lines) {
        if (lines[i].indexOf(by) >= 0) {
          lines[i] += '\n' + content
          fs.writeFileSync(filePath, lines.join('\n'))
          return true
        }
      }
    }
    return false
  }
}
