import type { CommandOptions } from '@adonisjs/core/types/ace'
import { BaseCommand } from '@adonisjs/core/ace'
import { stubsRoot } from '../stubs/main.ts'
import fs from 'node:fs'

export default class InstallCommand extends BaseCommand {
  static commandName = 'admin:uninstall'
  static description = 'uninstall admin'
  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    if (this.app.inDev) {
      const codemods = await this.createCodemods()

      // init files
      this.logger.action(this.delFile(this.app.middlewarePath('admin_middleware.ts'))).succeeded()
      this.logger.action(this.delFile(this.app.modelsPath('admin.ts'))).succeeded()
      this.logger.action(this.delFile(this.app.seedersPath('admin_seeder.ts'))).succeeded()
      this.logger.action(this.delFile(this.app.makePath('tests/admin_tests'))).succeeded()
      this.logger
        .action(this.delFile(this.app.migrationsPath('1744446870487_create_admin_table.ts')))
        .succeeded()

      // remove admin routes
      this.removeFileLine(this.app.startPath('routes.ts'), "await import('#start/admin')")
      this.logger.action(`change start/routes.ts`).succeeded()

      // overwrite auth config file
      codemods.overwriteExisting = true
      await codemods.makeUsingStub(stubsRoot, '/install/auth_config.stub', { name: 'user' })
    }
  }

  protected delFile(filePath: string) {
    if (fs.existsSync(filePath)) {
      if (fs.statSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true })
      } else {
        fs.rmSync(filePath)
      }
    }
    return `remove ${filePath}`
  }

  protected removeFileLine(filePath: string, content: string) {
    if (fs.existsSync(filePath)) {
      let file = fs.readFileSync(filePath, 'utf-8')
      if (file.indexOf(content) >= 0) {
        file = file.replace(content, '')
        fs.writeFileSync(filePath, file)
      }
    }
  }
}
