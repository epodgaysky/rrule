import { DateTime, DurationUnit } from 'luxon'

import { Frequency, Options, ParsedOptions, QueryMethodTypes } from '../types'
import IterResult from '../iterresult'
import { notEmpty } from '../helpers'
import { Weekday } from '../weekday'

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
  count?: number,
  exdateHash?: { [k: number]: boolean },
  evalExdate?: (after: Date, before: Date) => void,
) => {
  const frequencyUnit = UNIT_BY_FREQUENCY[frequency]
  const minDateTime = DateTime.fromJSDate(minDate ? minDate : maxDate, {
    zone: 'UTC',
  })
  const dtstartDateTime = DateTime.fromJSDate(dtstart, { zone: 'UTC' })

  const diff = Math.abs(
    dtstartDateTime.diff(minDateTime, frequencyUnit).get(frequencyUnit),
  )
  const intervalsInDiff = Math.floor(diff / interval)

  let optimisedDtstart = dtstartDateTime.plus({
    [frequencyUnit]: interval * intervalsInDiff,
  })

  let decrementCountFor = intervalsInDiff

  if (evalExdate) {
    evalExdate(
      optimisedDtstart.minus({ millisecond: 1 }).toJSDate(),
      optimisedDtstart.plus({ millisecond: 1 }).toJSDate(),
    )
  }

  while (exdateHash?.[optimisedDtstart.toMillis()]) {
    optimisedDtstart = optimisedDtstart.minus({ [frequencyUnit]: interval })
    decrementCountFor--
  }

  if (count !== undefined) {
    count = count - decrementCountFor
    count = count < 0 ? 0 : count
  }

  return {
    dtstart: optimisedDtstart.toJSDate(),
    count,
  }
}

export function optimiseOptions<M extends QueryMethodTypes>(
  iterResult: IterResult<M>,
  parsedOptions: ParsedOptions,
  origOptions: Partial<Options>,
  exdateHash?: { [k: number]: boolean },
  evalExdate?: (after: Date, before: Date) => void,
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
    byweekday,
    byeaster,
    interval = 1,
  } = origOptions
  const { minDate, maxDate, method, args } = iterResult
  const { dtstart } = parsedOptions
  const { skipOptimisation } = args

  if (
    skipOptimisation ||
    method === 'all' ||
    (!minDate && !maxDate) ||
    (minDate && minDate <= dtstart) ||
    (maxDate && maxDate <= dtstart) ||
    notEmpty(bymonth) ||
    notEmpty(bysetpos) ||
    notEmpty(bymonthday) ||
    notEmpty(byyearday) ||
    notEmpty(byweekno) ||
    notEmpty(byhour) ||
    notEmpty(byminute) ||
    notEmpty(bysecond) ||
    notEmpty(bysecond) ||
    notEmpty(byeaster) ||
    (notEmpty(byweekday) &&
      (Array.isArray(byweekday) ? byweekday : [byweekday]).some(
        (byweekdayInstance) => byweekdayInstance instanceof Weekday,
      ))
  ) {
    return parsedOptions
  }

  return {
    ...parsedOptions,
    ...optimize(
      freq,
      dtstart,
      interval,
      minDate,
      maxDate,
      count,
      exdateHash,
      evalExdate,
    ),
  }
}
