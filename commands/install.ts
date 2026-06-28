import type { CommandOptions } from '@adonisjs/core/types/ace'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import { stubsRoot } from '../stubs/main.ts'
import fs from 'node:fs'

export default class InstallCommand extends BaseCommand {
  static commandName = 'admin:install'
  static description = 'install admin dependencies file'
  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({ description: 'overwrite existing', default: false })
  declare force: boolean

  async run() {
    const codemods = await this.createCodemods()
    codemods.overwriteExisting = this.force

    // init files
    await codemods.makeUsingStub(stubsRoot, '/install/create_admin_table.stub', {})
    await codemods.makeUsingStub(stubsRoot, '/install/system_controller.stub', {})
    await codemods.makeUsingStub(stubsRoot, '/install/admin_middleware.stub', {})
    await codemods.makeUsingStub(stubsRoot, '/install/admin_model.stub', {})
    await codemods.makeUsingStub(stubsRoot, '/install/admin_routes.stub', {})
    await codemods.makeUsingStub(stubsRoot, '/install/admin_seeder.stub', {})
    await codemods.makeUsingStub(stubsRoot, '/install/admin_test.stub', {})

    // overwrite auth config file
    codemods.overwriteExisting = true
    await codemods.makeUsingStub(stubsRoot, '/install/auth_config.stub', { name: 'admin' })

    // append admin routes
    this.appendFileLine(this.app.startPath('routes.ts'), "await import('#start/admin')")
    this.logger.action(`change start/routes.ts`).succeeded()

    // run migrations
    if (!this.app.inTest) {
      await this.kernel.exec('migration:run', [])
      await this.kernel.exec('db:seed', [])
    }
  }

  protected appendFileLine(filePath: string, content: string) {
    if (fs.existsSync(filePath)) {
      let file = fs.readFileSync(filePath, 'utf-8')
      if (file.indexOf(content) < 0) {
        file += '\n' + content
      }
      fs.writeFileSync(filePath, file)
    }
  }
}
