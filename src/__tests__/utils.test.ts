import {
  formatWei,
  formatGwei,
  parseWei,
  truncateAddress,
  isValidAddress,
  formatDuration,
  formatPercent,
} from '../utils';

describe('formatWei', () => {
  it('formats 1 ETH from string', () => {
    expect(formatWei('1000000000000000000')).toBe('1.0 ETH');
  });

  it('formats 1 ETH from bigint', () => {
    expect(formatWei(1000000000000000000n)).toBe('1.0 ETH');
  });

  it('formats 0 ETH', () => {
    expect(formatWei('0')).toBe('0.0 ETH');
  });

  it('formats fractional ETH', () => {
    expect(formatWei('1500000000000000000')).toBe('1.5 ETH');
  });

  it('formats small wei amounts', () => {
    expect(formatWei('1000000000000')).toBe('0.000001 ETH');
  });

  it('formats large amounts', () => {
    expect(formatWei('100000000000000000000')).toBe('100.0 ETH');
  });

  it('trims trailing zeros in decimal', () => {
    const result = formatWei('1100000000000000000');
    expect(result).toBe('1.1 ETH');
  });
});

describe('formatGwei', () => {
  it('formats number', () => {
    expect(formatGwei(30.5)).toBe('30.5 gwei');
  });

  it('formats string', () => {
    expect(formatGwei('20')).toBe('20 gwei');
  });

  it('formats zero', () => {
    expect(formatGwei(0)).toBe('0 gwei');
  });
});

describe('parseWei', () => {
  it('parses whole ETH', () => {
    expect(parseWei('1')).toBe(1000000000000000000n);
  });

  it('parses fractional ETH', () => {
    expect(parseWei('1.5')).toBe(1500000000000000000n);
  });

  it('parses zero', () => {
    expect(parseWei('0')).toBe(0n);
  });

  it('parses very small amounts', () => {
    expect(parseWei('0.000001')).toBe(1000000000000n);
  });

  it('round-trips with formatWei', () => {
    const original = '2500000000000000000';
    const eth = '2.5';
    expect(parseWei(eth)).toBe(BigInt(original));
  });
});

describe('truncateAddress', () => {
  const addr = '0xabcdef1234567890abcdef1234567890abcdef12';

  it('truncates with default chars', () => {
    expect(truncateAddress(addr)).toBe('0xabcd...ef12');
  });

  it('truncates with custom chars', () => {
    expect(truncateAddress(addr, 6)).toBe('0xabcdef...cdef12');
  });

  it('returns short addresses unchanged', () => {
    expect(truncateAddress('0xab')).toBe('0xab');
  });
});

describe('isValidAddress', () => {
  it('validates correct address', () => {
    expect(isValidAddress('0xabcdef1234567890abcdef1234567890abcdef12')).toBe(true);
  });

  it('validates uppercase hex', () => {
    expect(isValidAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12')).toBe(true);
  });

  it('rejects missing 0x prefix', () => {
    expect(isValidAddress('abcdef1234567890abcdef1234567890abcdef12')).toBe(false);
  });

  it('rejects short address', () => {
    expect(isValidAddress('0xabcd')).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidAddress('0xZZZZZZ1234567890abcdef1234567890abcdef12')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidAddress('')).toBe(false);
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
  });

  it('formats exact minutes', () => {
    expect(formatDuration(120000)).toBe('2m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(5400000)).toBe('1h 30m');
  });

  it('formats exact hours', () => {
    expect(formatDuration(3600000)).toBe('1h');
  });
});

describe('formatPercent', () => {
  it('formats decimal rate', () => {
    expect(formatPercent(0.956)).toBe('95.60%');
  });

  it('formats zero', () => {
    expect(formatPercent(0)).toBe('0.00%');
  });

  it('formats 100%', () => {
    expect(formatPercent(1)).toBe('100.00%');
  });

  it('formats small rate', () => {
    expect(formatPercent(0.001)).toBe('0.10%');
  });
});
