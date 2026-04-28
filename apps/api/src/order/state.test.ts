import { describe, expect, it } from 'vitest';
import { canTransitionTicketItem, canTransitionTicket, canCloseTicket } from './state.js';

describe('canTransitionTicketItem', () => {
  it('NEW → FIRED is valid', () => {
    expect(canTransitionTicketItem('NEW', 'FIRED')).toBe(true);
  });
  it('NEW → READY is invalid (must fire first)', () => {
    expect(canTransitionTicketItem('NEW', 'READY')).toBe(false);
  });
  it('FIRED → READY is valid', () => {
    expect(canTransitionTicketItem('FIRED', 'READY')).toBe(true);
  });
  it('READY → SERVED is valid', () => {
    expect(canTransitionTicketItem('READY', 'SERVED')).toBe(true);
  });
  it('FIRED → SERVED is invalid (must mark ready first)', () => {
    expect(canTransitionTicketItem('FIRED', 'SERVED')).toBe(false);
  });
  it('any → VOIDED except SERVED is allowed', () => {
    expect(canTransitionTicketItem('NEW', 'VOIDED')).toBe(true);
    expect(canTransitionTicketItem('FIRED', 'VOIDED')).toBe(true);
    expect(canTransitionTicketItem('READY', 'VOIDED')).toBe(true);
  });
  it('SERVED → VOIDED is NOT allowed (already given to customer)', () => {
    expect(canTransitionTicketItem('SERVED', 'VOIDED')).toBe(false);
  });
  it('VOIDED is terminal', () => {
    expect(canTransitionTicketItem('VOIDED', 'FIRED')).toBe(false);
    expect(canTransitionTicketItem('VOIDED', 'SERVED')).toBe(false);
  });
});

describe('canTransitionTicket', () => {
  it('OPEN → CLOSED valid', () => {
    expect(canTransitionTicket('OPEN', 'CLOSED')).toBe(true);
  });
  it('OPEN → VOIDED valid', () => {
    expect(canTransitionTicket('OPEN', 'VOIDED')).toBe(true);
  });
  it('CLOSED → OPEN valid (reopen)', () => {
    expect(canTransitionTicket('CLOSED', 'OPEN')).toBe(true);
  });
  it('VOIDED is terminal', () => {
    expect(canTransitionTicket('VOIDED', 'OPEN')).toBe(false);
    expect(canTransitionTicket('VOIDED', 'CLOSED')).toBe(false);
  });
  it('CLOSED → VOIDED invalid (must reopen first)', () => {
    expect(canTransitionTicket('CLOSED', 'VOIDED')).toBe(false);
  });
});

describe('canCloseTicket', () => {
  it('all SERVED or VOIDED items: closable', () => {
    expect(canCloseTicket([{ status: 'SERVED' }, { status: 'VOIDED' }, { status: 'SERVED' }])).toBe(true);
  });
  it('any NEW or FIRED or READY item: NOT closable', () => {
    expect(canCloseTicket([{ status: 'SERVED' }, { status: 'NEW' }])).toBe(false);
    expect(canCloseTicket([{ status: 'FIRED' }])).toBe(false);
    expect(canCloseTicket([{ status: 'READY' }])).toBe(false);
  });
  it('empty ticket: closable', () => {
    expect(canCloseTicket([])).toBe(true);
  });
});
