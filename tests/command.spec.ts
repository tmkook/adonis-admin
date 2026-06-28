import { test } from '@japa/runner'
import Configure from '@adonisjs/core/commands/configure'
import InstallCommand from '../commands/install.ts'
import ResourceCommand from '../commands/resource.ts'
import UninstallCommand from '../commands/uninstall.ts'
import { createApp } from './utils.ts'

test.group('Commands', async (group) => {
  group.each.disableTimeout()

  test('Configure', async ({}) => {
    const app = await createApp()
    const ace = await app.container.make('ace')
    const configureCommand = await ace.create(Configure, ['../../index.ts', '--force'])
    await configureCommand.exec()
    configureCommand.assertSucceeded()
  })

  test('Install', async ({}) => {
    const app = await createApp()
    const ace = await app.container.make('ace')
    const installCommand = await ace.create(InstallCommand, ['--force'])
    await installCommand.exec()
    installCommand.assertSucceeded()
  })

  test('Resource', async ({}) => {
    const app = await createApp()

    const ace = await app.container.make('ace')
    const createCommand = await ace.create(ResourceCommand, ['user'])
    await createCommand.exec()
    createCommand.assertSucceeded()
  })

  test('Uninstall', async ({}) => {
    const app = await createApp()
    const ace = await app.container.make('ace')
    const uninstallCommand = await ace.create(UninstallCommand, [])
    await uninstallCommand.exec()
    uninstallCommand.assertSucceeded()
  })
})
