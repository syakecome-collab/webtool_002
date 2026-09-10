import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import App from '../App';

describe('配達ノート', () => {
  it('起動して記録画面と広告枠が出る', async () => {
    const screen = await render(<App />);
    expect(await screen.findByText('＋ 稼働を記録する')).toBeTruthy();
    expect(screen.getByText('配達ノート')).toBeTruthy();
    expect(screen.getByTestId('banner-ad')).toBeTruthy();
    expect(screen.getByText('まだ記録がありません。稼働が終わったら、件数と報酬を入れてください。')).toBeTruthy();
  });

  it('稼働を記録すると今日の数字と一覧に反映される', async () => {
    const screen = await render(<App />);
    await fireEvent.press(await screen.findByText('＋ 稼働を記録する'));

    await fireEvent.changeText(screen.getByLabelText('開始'), '11:00');
    await fireEvent.changeText(screen.getByLabelText('終了'), '20:00');
    await fireEvent.changeText(screen.getByLabelText('休憩'), '60');
    await fireEvent.changeText(screen.getByLabelText('件数'), '20');
    await fireEvent.changeText(screen.getByLabelText('報酬'), '12,000');
    await fireEvent.changeText(screen.getByLabelText('チップ'), '800');
    await fireEvent.changeText(screen.getByLabelText('経費'), '1200');
    await fireEvent.press(screen.getByText('保存する'));

    // 手取り 11,600 円 / 実働 8 時間 → 実質時給 1,450 円
    await waitFor(() => expect(screen.getAllByText('¥11,600').length).toBeGreaterThan(0));
    expect(screen.getByText('¥1,450')).toBeTruthy();
    expect(screen.getByText(/20件・時給¥1,450/)).toBeTruthy();
  });

  it('時刻が読めないときは保存せずに知らせる', async () => {
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
    const screen = await render(<App />);
    await fireEvent.press(await screen.findByText('＋ 稼働を記録する'));
    await fireEvent.changeText(screen.getByLabelText('開始'), 'あとで');
    await fireEvent.press(screen.getByText('保存する'));

    expect(alert).toHaveBeenCalledWith('時刻を確認してください', expect.any(String));
    expect(screen.getByText('保存する')).toBeTruthy();
    alert.mockRestore();
  });

  it('分析タブに集計と曜日別の内訳が出る', async () => {
    const screen = await render(<App />);
    await fireEvent.press(await screen.findByText('＋ 稼働を記録する'));
    await fireEvent.changeText(screen.getByLabelText('開始'), '11:00');
    await fireEvent.changeText(screen.getByLabelText('終了'), '19:00');
    await fireEvent.changeText(screen.getByLabelText('件数'), '16');
    await fireEvent.changeText(screen.getByLabelText('報酬'), '10000');
    await fireEvent.press(screen.getByText('保存する'));
    await waitFor(() => expect(screen.getAllByText('¥10,000').length).toBeGreaterThan(0));

    await fireEvent.press(screen.getByLabelText('分析'));
    expect(await screen.findByText('曜日別の実質時給')).toBeTruthy();
    expect(screen.getByText('天気別の実質時給')).toBeTruthy();
    expect(screen.getByText('直近 14 日の手取り')).toBeTruthy();
  });

  it('設定タブに申告用サマリと書き出しが出る', async () => {
    const screen = await render(<App />);
    await fireEvent.press(await screen.findByLabelText('設定'));
    expect(await screen.findByText('CSV を書き出す')).toBeTruthy();
    expect(screen.getByText('すべての記録を削除')).toBeTruthy();
    expect(screen.getByText(/記録はこの端末の中だけに保存されます/)).toBeTruthy();
  });
});
