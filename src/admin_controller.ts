import vine from '@vinejs/vine'
import * as utils from './utils.ts'
import { ResourceHelper } from './resource_helper.ts'

const usernameValidator = vine
  .string()
  .trim()
  .minLength(3)
  .maxLength(30)
  .regex(/^[a-zA-Z]+$/)

const passwordValidator = vine
  .string()
  .minLength(8)
  .maxLength(32)
  .regex(/[a-zA-Z]/)
  .regex(/[0-9]/)

const phoneValidator = vine.string().regex(/^\+?\d{6,15}$/)

const resource = new ResourceHelper()

export abstract class SystemController {
  protected abstract model: any
  protected totpEnabled: boolean = false

  /**
   * User mine api
   */
  async mine(ctx: any) {
    const user = ctx.auth.getUserOrFail()
    return resource.success(user)
  }

  /**
   * User login api
   */
  async login(ctx: any) {
    const loginValidator = vine.create(
      vine.object({
        username: usernameValidator,
        password: passwordValidator,
        remember: vine.string().optional(),
        authCode: vine.string().minLength(6).optional(),
        authToken: vine.string().minLength(16).optional(),
      })
    )
    const params = await ctx.request.validateUsing(loginValidator)
    const user = await this.model.verifyCredentials(params.username, params.password)
    if (user.status !== 1) {
      return resource.error('user disabled', 'E_USER_DISABLED')
    }

    // 2fa enabled
    if (user.secret && this.totpEnabled) {
      if (params.authCode && params.authToken) {
        const isPassCode = await utils.totp.verify(params.authCode, { secret: user.secret, digits: 6 })
        if (!isPassCode) {
          return resource.error('authCode invalid', 'E_TOTP_ERROR')
        }
      } else {
        const authToken = utils.makeAuthToken({ userId: String(user.id) })
        return resource.error('enable 2fa', 'E_TOTP_ERROR', 2, { authToken })
      }
    }

    // Create accessToken
    const tokenName = utils.makeTokenName(ctx.request)
    const accessToken = await this.model.accessTokens.create(user, ['*'], {
      expiresIn: '1d',
      name: tokenName,
    })

    const tokenData = { accessTokenId: String(accessToken.identifier), userId: String(user.id) }
    const refreshToken = utils.makeRefreshToken(tokenData)

    const tokens = {
      refreshToken: refreshToken,
      accessToken: accessToken.value!.release(),
      expires: accessToken.expiresAt!.getTime(),
    }

    const roles = await this.model.getUserRoleCodes(user)
    return resource.success({ user, roles, tokens })
  }

  /**
   * User refresh token api
   */
  async refreshToken(ctx: any) {
    const tokenValidator = vine.create(
      vine.object({
        refreshToken: vine.string().minLength(16),
      })
    )

    const params = await ctx.request.validateUsing(tokenValidator)
    const tokens = utils.verifyRefreshToken(params.refreshToken)
    const user = await this.model.findOrFail(tokens.userId)
    if (user.status !== 1) {
      return resource.error('user disabled', 'E_USER_DISABLED')
    }

    // refresh accessToken
    await this.model.accessTokens.delete(user, tokens.accessTokenId)
    const tokenName = utils.makeTokenName(ctx.request)
    const accessToken = await this.model.accessTokens.create(user, ['*'], {
      expiresIn: '1d',
      name: tokenName,
    })

    const tokenData = { accessTokenId: String(accessToken.identifier), userId: String(user.id) }
    const refreshToken = utils.makeRefreshToken(tokenData)

    return resource.success({
      refreshToken: refreshToken,
      accessToken: accessToken.value!.release(),
      expires: accessToken.expiresAt!.getTime(),
    })
  }

  /**
   * User forgot password api
   */
  async forgotPassword(ctx: any) {
    const forgotPasswordValidator = vine.create(
      vine.object({
        newPassword: passwordValidator,
        username: usernameValidator,
        phone: phoneValidator.optional(),
        email: vine.string().email().optional(),
        code: vine.string().minLength(6),
      })
    )

    const params = await ctx.request.validateUsing(forgotPasswordValidator)
    if (!params.phone && !params.email) {
      return resource.error('phone and email can not be both empty', 'E_PARAM_ERROR')
    }

    const user = await this.model.query().where('username', params.username).firstOrFail()
    if (user.phone !== params.phone && user.email !== params.email) {
      return resource.error('phone and email do not match', 'E_USER_ERROR')
    }

    const isValid = await utils.totp.verify(params.code, { secret: user.secret, digits: 6 })
    if (!isValid) {
      return resource.error('code invalid', 'E_TOTP_ERROR')
    }

    user.password = params.newPassword
    await user.save()
    return resource.success(user)
  }

  /**
   * Get my all accessTokens api
   */
  async accessTokens(ctx: any) {
    const list: any[] = []
    const user = ctx.auth.getUserOrFail()
    const current = user.currentAccessToken?.identifier
    const tokens = await this.model.accessTokens.all(user)
    for (let item of tokens) {
      list.push({
        name: item.name,
        id: item.identifier,
        expiresAt: item.expiresAt,
        lastUsedAt: item.lastUsedAt,
      })
    }
    return resource.success({ list, current })
  }

  /**
   * User destroy accessToken api
   * Support id='current' to delete current token
   */
  async outAccessToken(ctx: any) {
    const idParam = ctx.request.param('id')
    const user = ctx.auth.getUserOrFail()

    // Handle 'current' keyword to delete current token
    let tokenId: number
    if (idParam === 'current') {
      tokenId = user.currentAccessToken!.identifier
    } else {
      tokenId = Number(idParam)
      if (tokenId < 1) {
        return resource.error('invalid accessToken id', 'E_PARAM_ERROR')
      }
    }

    const deleted = await this.model.accessTokens.delete(user, tokenId)
    return resource.success({ destroyed: deleted })
  }

  /**
   * User update mine api
   */
  async updateMine(ctx: any) {
    const user = ctx.auth.getUserOrFail()

    // update password
    if (ctx.request.input('password')) {
      const updatePasswordValidator = vine.create(
        vine.object({
          password: passwordValidator,
          newPassword: passwordValidator,
        })
      )
      const data = await ctx.request.validateUsing(updatePasswordValidator)
      await this.model.verifyCredentials(user.username, data.password)
      user.password = data.newPassword
    }

    // bind totp secret
    if (ctx.request.input('code')) {
      const updateTotpValidator = vine.create(
        vine.object({
          secret: vine.string().minLength(8),
          code: vine.string().minLength(4).maxLength(8),
        })
      )
      const data = await ctx.request.validateUsing(updateTotpValidator)
      const isValid = await utils.totp.verify(data.code, { secret: data.secret, digits: 6 })
      if (!isValid) {
        return resource.error('totp code invalid', 'E_TOTP_ERROR')
      }
      user.secret = data.secret
    }

    // update profile
    const updateProfileValidator = vine.create(
      vine.object({
        phone: phoneValidator,
        avatar: vine.string().url().optional(),
        nickname: vine.string().trim().minLength(1).maxLength(30).optional(),
        sex: vine.number().in([0, 1, 2]).optional(),
        email: vine.string().email().optional(),
        remark: vine.string().trim().maxLength(56).optional(),
      })
    )
    const profile = await ctx.request.validateUsing(updateProfileValidator)
    await user.merge(profile).save()
    return resource.success(user)
  }

  /**
   * User totp api
   * otpauth://totp/ACME:john@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME
   */
  async showTotpSecret(ctx: any) {
    const user = ctx.auth.getUserOrFail()
    const secret = utils.totp.generateSecret()
    const uri = utils.totp.toURI({ secret: secret, issuer: user.nickname, label: user.username })
    return resource.success({ secret: secret, uri: uri })
  }

  /**
   * File upload api (mock implementation)
   */
  async upload(_ctx: any) {
    return resource.success({
      url: 'https://pic1.imgdb.cn/item/6a36fd7e2830ce602a50eed1.webp',
    })
  }
}

export abstract class UserController {
  protected abstract model: any

  /**
   * Display a list of resource
   */
  async index(ctx: any) {
    const filters = {
      id: resource.symbols.eq,
      username: resource.symbols.eq,
      remark: resource.symbols.like,
      status: resource.symbols.eq,
    }
    const query = resource.query(this.model.query(), ctx.request.qs(), filters)
    const result = await resource.paginate(query, ctx.request.qs())
    return resource.success(result)
  }

  /**
   * Show individual record
   */
  async show(ctx: any) {
    const result = await resource.detail(this.model, ctx.request.param('id'))
    return resource.success(result)
  }

  /**
   * Handle form submission for the create action
   */
  async store(ctx: any) {
    const data = await ctx.request.validateUsing(
      vine.create(
        vine.object({
          username: usernameValidator,
          password: passwordValidator,
          nickname: vine.string().trim().minLength(1).maxLength(30),
          permissions: vine.string().optional(),
          phone: phoneValidator.optional(),
          email: vine.string().email().optional(),
          secret: vine.string().minLength(8).optional(),
          deptId: vine.number().optional(),
          remark: vine.string().trim().maxLength(128).optional(),
          sex: vine.number().in([0, 1, 2]).optional(),
          status: vine.number().in([0, 1]).optional(),
        })
      )
    )
    const result = await resource.create(this.model, data)
    return resource.success(result)
  }

  /**
   * Handle form submission for the edit action
   */
  async update(ctx: any) {
    const data = await ctx.request.validateUsing(
      vine.create(
        vine.object({
          username: usernameValidator,
          password: passwordValidator.optional(),
          nickname: vine.string().trim().minLength(1).maxLength(30),
          permissions: vine.string().optional(),
          phone: phoneValidator.optional(),
          email: vine.string().email().optional(),
          secret: vine.string().minLength(8).optional(),
          deptId: vine.number().optional(),
          remark: vine.string().trim().maxLength(128).optional(),
          sex: vine.number().in([0, 1, 2]).optional(),
          status: vine.number().in([0, 1]).optional(),
        })
      )
    )
    const result = await resource.update(this.model, data, ctx.request.param('id'))
    return resource.success(result)
  }

  /**
   * Delete record
   */
  async destroy(ctx: any) {
    const result = await resource.delete(this.model, ctx.request.param('id'))
    return resource.success(result)
  }
}

export abstract class RoleController {
  protected abstract model: any

  /**
   * Display a list of resource
   */
  async index(ctx: any) {
    const filters = {
      id: resource.symbols.eq,
      name: resource.symbols.eq,
      code: resource.symbols.eq,
      remark: resource.symbols.like,
      status: resource.symbols.eq,
    }
    const query = resource.query(this.model.query(), ctx.request.qs(), filters)
    const result = await resource.paginate(query, ctx.request.qs())
    return resource.success(result)
  }

  /**
   * Show individual record
   */
  async show(ctx: any) {
    const result = await resource.detail(this.model, ctx.request.param('id'))
    return resource.success(result)
  }

  /**
   * Handle form submission for the create action
   */
  async store(ctx: any) {
    const data = await ctx.request.validateUsing(
      vine.create(
        vine.object({
          name: vine.string().trim().minLength(1).maxLength(30),
          code: vine.string().trim().minLength(1).maxLength(30),
          remark: vine.string().trim().maxLength(128).optional(),
          status: vine.number().in([0, 1]),
        })
      )
    )
    const result = await resource.create(this.model, data)
    return resource.success(result)
  }

  /**
   * Handle form submission for the edit action
   */
  async update(ctx: any) {
    const data = await ctx.request.validateUsing(
      vine.create(
        vine.object({
          name: vine.string().trim().minLength(1).maxLength(30),
          code: vine.string().trim().minLength(1).maxLength(30),
          remark: vine.string().trim().maxLength(128).optional(),
          status: vine.number().in([0, 1]),
        })
      )
    )
    const result = await resource.update(this.model, data, ctx.request.param('id'))
    return resource.success(result)
  }

  /**
   * Delete record
   */
  async destroy(ctx: any) {
    const result = await resource.delete(this.model, ctx.request.param('id'))
    return resource.success(result)
  }
}

export abstract class MenuController {
  protected abstract model: any

  /**
   * Display a list of resource
   */
  async index(ctx: any) {
    const filters = {
      id: resource.symbols.eq,
      name: resource.symbols.like,
      path: resource.symbols.like,
      permissions: resource.symbols.like,
      status: resource.symbols.eq,
    }
    const query = resource.query(this.model.query(), ctx.request.qs(), filters)
    const result = await resource.paginate(query, ctx.request.qs())
    return resource.success(result)
  }

  /**
   * Show individual record
   */
  async show(ctx: any) {
    const result = await resource.detail(this.model, ctx.request.param('id'))
    return resource.success(result)
  }

  /**
   * Handle form submission for the create action
   */
  async store(ctx: any) {
    const data = await ctx.request.validateUsing(
      vine.create(
        vine.object({
          parentId: vine.number().optional(),
          title: vine.string().trim().minLength(1).maxLength(30),
          name: vine.string().trim().minLength(1).maxLength(30),
          path: vine.string().trim().maxLength(56).optional(),
          icon: vine.string().trim().maxLength(56).optional(),
          badge: vine.string().trim().maxLength(56).optional(),
          component: vine.string().trim().maxLength(56).optional(),
          redirect: vine.string().trim().maxLength(56).optional(),
          permissions: vine.string().optional(),
          show: vine.boolean().optional(),
          sort: vine.number().optional(),
          status: vine.number().in([0, 1]),
        })
      )
    )
    const result = await resource.create(this.model, data)
    return resource.success(result)
  }

  /**
   * Handle form submission for the edit action
   */
  async update(ctx: any) {
    const data = await ctx.request.validateUsing(
      vine.create(
        vine.object({
          parentId: vine.number().optional(),
          title: vine.string().trim().minLength(1).maxLength(30),
          name: vine.string().trim().minLength(1).maxLength(30),
          path: vine.string().trim().maxLength(56).optional(),
          icon: vine.string().trim().maxLength(56).optional(),
          badge: vine.string().trim().maxLength(56).optional(),
          component: vine.string().trim().maxLength(56).optional(),
          redirect: vine.string().trim().maxLength(56).optional(),
          permissions: vine.string().optional(),
          show: vine.boolean().optional(),
          sort: vine.number().optional(),
          status: vine.number().in([0, 1]),
        })
      )
    )
    const result = await resource.update(this.model, data, ctx.request.param('id'))
    return resource.success(result)
  }

  /**
   * Delete record
   */
  async destroy(ctx: any) {
    const result = await resource.delete(this.model, ctx.request.param('id'))
    return resource.success(result)
  }
}

export abstract class DeptController {
  protected abstract model: any

  /**
   * Display a list of resource
   */
  async index(ctx: any) {
    const filters = {
      id: resource.symbols.eq,
      name: resource.symbols.like,
      leader: resource.symbols.like,
      remark: resource.symbols.like,
      status: resource.symbols.eq,
    }
    const query = resource.query(this.model.query(), ctx.request.qs(), filters)
    const result = await resource.paginate(query, ctx.request.qs())
    return resource.success(result)
  }

  /**
   * Show individual record
   */
  async show(ctx: any) {
    const result = await resource.detail(this.model, ctx.request.param('id'))
    return resource.success(result)
  }

  /**
   * Handle form submission for the create action
   */
  async store(ctx: any) {
    const data = await ctx.request.validateUsing(
      vine.create(
        vine.object({
          parentId: vine.number().optional(),
          name: vine.string().trim().minLength(1).maxLength(30),
          leader: vine.string().trim().maxLength(30).optional(),
          phone: phoneValidator,
          email: vine.string().email().optional(),
          remark: vine.string().trim().maxLength(255).optional(),
          sort: vine.number().optional(),
          status: vine.number().in([0, 1]),
        })
      )
    )
    const result = await resource.create(this.model, data)
    return resource.success(result)
  }

  /**
   * Handle form submission for the edit action
   */
  async update(ctx: any) {
    const data = await ctx.request.validateUsing(
      vine.create(
        vine.object({
          parentId: vine.number().optional(),
          name: vine.string().trim().minLength(1).maxLength(30),
          leader: vine.string().trim().maxLength(30).optional(),
          phone: phoneValidator,
          email: vine.string().email().optional(),
          remark: vine.string().trim().maxLength(255).optional(),
          sort: vine.number().optional(),
          status: vine.number().in([0, 1]),
        })
      )
    )
    const result = await resource.update(this.model, data, ctx.request.param('id'))
    return resource.success(result)
  }

  /**
   * Delete record
   */
  async destroy(ctx: any) {
    const result = await resource.delete(this.model, ctx.request.param('id'))
    return resource.success(result)
  }
}

export abstract class LogController {
  protected abstract model: any

  /**
   * Display a list of resource
   */
  async index(ctx: any) {
    const filters = {
      id: resource.symbols.eq,
      username: resource.symbols.like,
      path: resource.symbols.like,
      method: resource.symbols.eq,
      status: resource.symbols.eq,
    }
    const query = resource.query(this.model.query(), ctx.request.qs(), filters)
    const result = await resource.paginate(query, ctx.request.qs())
    return resource.success(result)
  }

  /**
   * Show individual record
   */
  async show(ctx: any) {
    const result = await resource.detail(this.model, ctx.request.param('id'))
    return resource.success(result)
  }

  /**
   * Delete record
   */
  async destroy(ctx: any) {
    const result = await resource.delete(this.model, ctx.request.param('id'))
    return resource.success(result)
  }
}
