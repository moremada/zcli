import type { Job } from '../../../zcli-themes/src/types'
import { expect, test } from '@oclif/test'
import * as path from 'path'
import * as nock from 'nock'
import UpdateCommand from '../../src/commands/themes/update'

describe('themes:update', function () {
  const baseThemePath = path.join(__dirname, 'mocks/base_theme')
  const job: Job = {
    id: '9999',
    status: 'pending',
    data: {
      theme_id: '1234',
      upload: {
        url: 'https://s3.com/upload/path',
        parameters: {}
      }
    }
  }

  describe('successful update', () => {
    test
      .env({
        ZENDESK_SUBDOMAIN: 'z3ntest',
        ZENDESK_EMAIL: 'admin@z3ntest.com',
        ZENDESK_PASSWORD: '123456' // the universal password
      })
      .nock('https://z3ntest.zendesk.com', api => {
        api
          .post('/api/v2/guide/theming/jobs/themes/updates')
          .reply(202, { job })

        api
          .get('/api/v2/guide/theming/jobs/9999')
          .reply(200, { job: { ...job, status: 'completed' } })
      })
      .nock('https://s3.com', (api) => {
        api
          .post('/upload/path')
          .reply(200)
      })
      .stdout()
      .it('should display success message when the theme is updated successfully', async ctx => {
        await UpdateCommand.run([baseThemePath, '--themeId', '1234'])
        expect(ctx.stdout).to.contain('Theme updated successfully')
      })
  })

  describe('update failure', () => {
    test
      .stderr()
      .env({
        ZENDESK_SUBDOMAIN: 'z3ntest',
        ZENDESK_EMAIL: 'admin@z3ntest.com',
        ZENDESK_PASSWORD: '123456' // the universal password
      })
      .nock('https://z3ntest.zendesk.com', api => {
        api
          .post('/api/v2/guide/theming/jobs/themes/updates')
          .reply(400, {
            errors: [{
              code: 'TooManyThemes',
              title: 'Maximum number of allowed themes reached'
            }]
          })
      })
      .it('should report errors when creating the update job fails', async (ctx) => {
        try {
          await UpdateCommand.run([baseThemePath, '--themeId', '1234'])
        } catch (error) {
          expect(ctx.stderr).to.contain('!')
          expect(error.message).to.contain('TooManyThemes')
          expect(error.message).to.contain('Maximum number of allowed themes reached')
        } finally {
          nock.cleanAll()
        }
      })

    test
      .env({
        ZENDESK_SUBDOMAIN: 'z3ntest',
        ZENDESK_EMAIL: 'admin@z3ntest.com',
        ZENDESK_PASSWORD: '123456' // the universal password
      })
      .nock('https://z3ntest.zendesk.com', api => {
        api
          .post('/api/v2/guide/theming/jobs/themes/updates')
          .reply(202, { job })

        api
          .get('/api/v2/guide/theming/jobs/9999')
          .reply(200, {
            job: {
              ...job,
              status: 'failed',
              data: null,
              errors: [
                {
                  message: 'Template(s) with syntax error(s)',
                  code: 'InvalidTemplates',
                  meta: {
                    'templates/new_request_page.hbs': [
                      {
                        description: "'request_fosrm' does not exist",
                        line: 22,
                        column: 6,
                        length: 10
                      }
                    ]
                  }
                }
              ]
            }
          })
      })
      .nock('https://s3.com', (api) => {
        api
          .post('/upload/path')
          .reply(200)
      })
      .it('should report validation errors', async (ctx) => {
        try {
          await UpdateCommand.run([baseThemePath, '--themeId', '1111'])
        } catch (error) {
          expect(error.message).to.contain('InvalidTemplates')
          expect(error.message).to.contain('Template(s) with syntax error(s)')
          expect(error.message).to.contain('Validation error')
          expect(error.message).to.contain("'request_fosrm' does not exist")
        } finally {
          nock.cleanAll()
        }
      })
  })
})
