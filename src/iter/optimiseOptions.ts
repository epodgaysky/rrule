import { Frequency, Options, ParsedOptions, QueryMethodTypes } from '../types'
import {
  daysBetween,
  monthsBetween,
  weeksBetween,
  yearsBetween,
} from '../dateutil'
import IterResult from '../iterresult'

export type ShortenDtstart = (
  minDate: Date,
  dtstart: Date,
  interval: number
) => Date

const SHORTEN_DTSTART_DEFAULT: ShortenDtstart = (
  minDate: Date,
  dtstart: Date
) => dtstart
const INTERVALS_IN_DIFF_TO_OPTIMISE = 2
const FREQUENCIES_SET_TO_OPTIMISE = new Set([
  Frequency.YEARLY,
  Frequency.MONTHLY,
  Frequency.WEEKLY,
  Frequency.DAILY,
])

const DTSTART_SHORTENING_STRATEGY: Record<Frequency, ShortenDtstart> = {
  [Frequency.DAILY]: (minDate: Date, dtstart: Date, interval: number) => {
    const diffDays = Math.abs(daysBetween(minDate, dtstart))
    const intervalsInDiff = Math.floor(diffDays / interval)

    if (intervalsInDiff < INTERVALS_IN_DIFF_TO_OPTIMISE) {
      return dtstart
    }

    return new Date(
      new Date(dtstart).setDate(
        dtstart.getDate() + (intervalsInDiff - 1) * interval
      )
    )
  },
  [Frequency.WEEKLY]: (minDate: Date, dtstart: Date, interval: number) => {
    const diffWeeks = Math.abs(weeksBetween(minDate, dtstart))
    const intervalsInDiff = Math.floor(diffWeeks / interval)

    if (intervalsInDiff < INTERVALS_IN_DIFF_TO_OPTIMISE) {
      return dtstart
    }

    return new Date(
      new Date(dtstart).setDate(
        dtstart.getDate() + (intervalsInDiff - 1) * interval * 7
      )
    )
  },
  [Frequency.MONTHLY]: (minDate: Date, dtstart: Date, interval: number) => {
    const diffMonths = Math.abs(monthsBetween(minDate, dtstart))
    const intervalsInDiff = Math.floor(diffMonths / interval)

    if (intervalsInDiff < INTERVALS_IN_DIFF_TO_OPTIMISE) {
      return dtstart
    }

    const resultDate = new Date(dtstart)

    return new Date(
      resultDate.setMonth(
        resultDate.getMonth() + (intervalsInDiff - 1) * interval
      )
    )
  },
  [Frequency.YEARLY]: (minDate: Date, dtstart: Date, interval: number) => {
    const diffYears = Math.abs(yearsBetween(minDate, dtstart))
    const intervalsInDiff = Math.floor(diffYears / interval)

    if (intervalsInDiff < INTERVALS_IN_DIFF_TO_OPTIMISE) {
      return dtstart
    }

    const resultDate = new Date(dtstart)

    return new Date(
      resultDate.setFullYear(
        resultDate.getFullYear() + (intervalsInDiff - 1) * interval
      )
    )
  },
  [Frequency.HOURLY]: SHORTEN_DTSTART_DEFAULT,
  [Frequency.MINUTELY]: SHORTEN_DTSTART_DEFAULT,
  [Frequency.SECONDLY]: SHORTEN_DTSTART_DEFAULT,
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
  const { method, minDate } = iterResult
  const { dtstart } = parsedOptions

  if (
    method === 'before' ||
    !minDate ||
    minDate < dtstart ||
    !FREQUENCIES_SET_TO_OPTIMISE.has(freq) ||
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
    dtstart: DTSTART_SHORTENING_STRATEGY[freq](minDate, dtstart, interval),
  }
}
