import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { WebConfigurationErrorPage } from './WebConfigurationErrorPage'

describe('WebConfigurationErrorPage', (): void => {
  it('announces the missing backend configuration and explains how to recover', (): void => {
    render(<WebConfigurationErrorPage />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '无法启动 Web 联调' })).toBeInTheDocument()
    expect(screen.getByText(/VITE_API_BASE_URL/u)).toBeInTheDocument()
    expect(screen.getByText(/VITE_API_HOSTNAME/u)).toBeInTheDocument()
    expect(screen.getByText(/\.env\.local/u)).toBeInTheDocument()
  })
})
