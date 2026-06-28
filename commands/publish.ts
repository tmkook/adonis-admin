import type { CommandOptions } from '@adonisjs/core/types/ace'
import { BaseCommand } from '@adonisjs/core/ace'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'

export default class MakeCommand extends BaseCommand {
  static commandName = 'admin:publish'
  static description = 'download a frontend framework'
  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    try {
      const viewsDir = this.app.viewsPath()
      const targetDir = join(dirname(viewsDir), 'admin')
      execSync('npx giget@latest gh:ant-design/ant-design-pro#master ' + targetDir, {
        stdio: 'inherit',
      })
      this.logger.success('download ant-design/ant-design-pro')
    } catch (error) {
      this.logger.error('npx giget@latest execute error', error)
    }
  }
}
