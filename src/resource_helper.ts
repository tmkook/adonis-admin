import type { LucidModel, LucidRow, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

enum QuerySymbols {
  eq = 'eq',
  gt = 'gt',
  lt = 'lt',
  like = 'like',
  between = 'between',
}

type SuccessResponse = {
  code: number
  message: string
  data: Record<string, any>
}

type ErrorResponse = {
  code: number
  error: string
  message: string
  data?: Record<string, any>
}

export class ResourceHelper {
  /**
   * query symbols
   */
  symbols = QuerySymbols

  /**
   * constructor
   * @param pk Primary key field name
   */
  constructor(
    protected pk: string = 'id',
    protected pageKey: string = 'page',
    protected perPageKey: string = 'perPage'
  ) {}

  /**
   * Success response
   * @param data Data
   * @param message Message
   * @returns SuccessResponse
   * @example
   * return this.success(data)
   * return this.success(data, 'success')
   */
  success(data: any, message: string = 'success'): SuccessResponse {
    return { code: 0, message, data }
  }

  /**
   * Error response
   * @param message Message
   * @param error Error code
   * @param code Status code
   * @returns ErrorResponse
   * @example
   * return this.error('error')
   * return this.error('error', 'E_ADMIN_ERROR')
   * return this.error('error', 'E_ADMIN_ERROR', 500)
   */
  error(
    message: string,
    error: string = 'E_ADMIN_ERROR',
    code: number = 500,
    data?: Record<string, any>
  ): ErrorResponse {
    const ret: ErrorResponse = { code, error, message }
    if (data) {
      ret.data = data
    }
    return ret
  }

  /**
   * Query database
   * @param model Model
   * @param params Query parameters
   * @param filters Query filters
   * @returns LucidRow
   * @example
   * this.query(AdminUser, { phone: '888' }, { phone: symbols.like })
   * this.query(AdminUser, { username: 'admin' }, { username: symbols.eq })
   */
  query(
    model: ModelQueryBuilderContract<LucidModel, LucidRow>,
    params: Record<string, string> = {},
    filters: Record<string, QuerySymbols> = {}
  ) {
    for (let key in params) {
      if (params[key] === '') {
        continue
      }
      switch (filters[key]) {
        case QuerySymbols.eq:
          model = model.where(key, params[key])
          break
        case QuerySymbols.gt:
          model = model.where(key, '>', params[key])
          break
        case QuerySymbols.lt:
          model = model.where(key, '<', params[key])
          break
        case QuerySymbols.like:
          model = model.whereLike(key, '%' + params[key] + '%')
          break
        case QuerySymbols.between:
          const value = params[key].split(',').filter((v) => v !== '')
          if (value.length === 1) {
            model = model.where(key, '>', value[0])
          } else if (value.length === 2) {
            model = model.whereBetween(key, [value[0], value[1]])
          }
          break
        default:
          break
      }
    }
    if (params.sort) {
      model = model.orderBy(params.sort, params.order === 'desc' ? 'desc' : 'asc')
    }
    return model
  }

  /**
   * Paginate query database
   * @param model
   * @param params
   * @returns LucidRow[]
   */
  paginate(
    model: ModelQueryBuilderContract<LucidModel, LucidRow>,
    params: Record<string, string> = {},
    getAll: boolean = false
  ) {
    let page = Number(params[this.pageKey]) || 1
    let perPage = Number(params[this.perPageKey]) || 10
    if (!getAll && perPage > 100) {
      throw new Error('perPage must be less than 100')
    }
    return model.paginate(page, perPage)
  }

  /**
   * Get detail
   * @param model Model
   * @param id Primary key value
   * @returns LucidRow
   * @example
   * return this.detail(AdminUser, 1)
   */
  async detail(model: LucidModel, id: number | string) {
    return await model.findByOrFail(this.pk, id)
  }

  /**
   * Create database record
   * @param model Model
   * @param data Data
   * @param fn Callback function
   * @returns LucidRow
   * @example
   * this.create(AdminUser, { username: 'admin', password: '123456' })
   */
  async create(model: LucidModel, data: Record<string, any>, fn?: Function) {
    return await model.transaction(async (trx) => {
      let item = await model.create(data, { client: trx })
      if (fn) {
        await fn({ client: trx })
      }
      return item
    })
  }

  /**
   * Update database record
   * @param model Model
   * @param data Data
   * @param id Primary key value
   * @param fn Callback function
   * @returns string[]
   * @example
   * this.update(AdminUser, { password: '123456' }, 1)
   * this.update(AdminUser, { password: '123456' }, '1,2,3')
   */
  async update(model: LucidModel, data: Record<string, any>, id: number | string, fn?: Function) {
    let ids = String(id).split(',')
    return await model.transaction(async (trx) => {
      await model.query({ client: trx }).whereIn(this.pk, ids).update(data)
      if (fn) {
        await fn({ client: trx })
      }
      return ids
    })
  }

  /**
   * Delete database record
   * @param model Model
   * @param id Primary key value
   * @returns string[]
   * @example
   * this.delete(AdminUser, 1)
   * this.delete(AdminUser, '1,2,3')
   */
  async delete(model: LucidModel, id: number | string) {
    let ids = String(id).split(',')
    return await model.transaction(async (trx) => {
      for (let itemId of ids) {
        await model.query({ client: trx }).where(this.pk, itemId).delete()
      }
      return ids
    })
  }
}
