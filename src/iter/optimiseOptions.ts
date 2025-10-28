import { DateTime, DurationUnit } from 'luxon'

import { Frequency, Options, ParsedOptions, QueryMethodTypes } from '../types'
import IterResult from '../iterresult'

const UNIT_BY_FREQUENCY: Record<Frequency, Required<DurationUnit>> = {
  [Frequency.YEARLY]: 'year',
  [Frequency.MONTHLY]: 'month',
  [Frequency.WEEKLY]: 'week',
  [Frequency.DAILY]: 'day',
  [Frequency.HOURLY]: 'hour',
  [Frequency.MINUTELY]: 'minute',
  [Frequency.SECONDLY]: 'second',
}

const optimize = (
  frequency: Frequency,
  dtstart: Date,
  interval: number,
  minDate?: Date,
  maxDate?: Date,
  count?: number
) => {
  const frequencyUnit = UNIT_BY_FREQUENCY[frequency]
  const minDateTime = DateTime.fromJSDate(minDate ? minDate : maxDate)
  const dtstartDateTime = DateTime.fromJSDate(dtstart)

  try {
    const diff = Math.abs(
      dtstartDateTime.diff(minDateTime, frequencyUnit).get(frequencyUnit)
    )
    const intervalsInDiff = Math.floor(diff / interval)

    return {
      dtstart: dtstartDateTime
        .plus({ [frequencyUnit]: intervalsInDiff })
        .toJSDate(),
      count: count ? count - intervalsInDiff : count,
    }
  } catch (error) {
    console.error(
      'UNEXPECTED ERROR: ',
      frequency,
      frequencyUnit,
      minDateTime,
      dtstartDateTime
    )
  }
}

export function optimiseOptions<M extends QueryMethodTypes>(
  iterResult: IterResult<M>,
  parsedOptions: ParsedOptions,
  origOptions: Partial<Options>
) {
  const {
    freq,
    count,
    bymonth,
    bysetpos,
    bymonthday,
    byyearday,
    byweekno,
    byhour,
    byminute,
    bysecond,
    byeaster,
    interval = 1,
  } = origOptions
  const { minDate, maxDate } = iterResult
  const { dtstart } = parsedOptions

  if (
    (!minDate && !maxDate) ||
    (minDate && minDate < dtstart) ||
    (maxDate && maxDate < dtstart) ||
    count ||
    bymonth ||
    bysetpos ||
    bymonthday ||
    byyearday ||
    byweekno ||
    byhour ||
    byminute ||
    bysecond ||
    byeaster
  ) {
    return parsedOptions
  }

  return {
    ...parsedOptions,
    ...optimize(freq, dtstart, interval, minDate, maxDate, count),
  }
}
